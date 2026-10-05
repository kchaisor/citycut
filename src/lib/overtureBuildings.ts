/**
 * Overture Maps building footprints from official PMTiles (z14).
 *
 * `building_part` is not used for massing: the parent `building` footprint carries
 * consolidated height and the site-plan ring. Parts would duplicate sub-volumes already
 * represented on the footprint and conflict with CoM height clipping on one outline.
 */

import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import polygonClipping from "polygon-clipping";
import { classify } from "./buildingUse";
import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { clipPolygon } from "./clip";
import { dedupeBuildings } from "./footprints";
import { dedupeConsecutive, openRing, signedArea, toLocal } from "./geo";
import { footprintArea } from "./useCascade";
import { overtureBuildingHeight, overtureHeightUsesFallback, overtureMinHeightM } from "./overtureHeight";
import { overtureBuildingsUrl, resolveOvertureRelease } from "./overtureRelease";
import { parseOvertureSources, pickTallestOvertureProps } from "./overtureSources";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, LonLat, Pt, Ring } from "../types";

export { parseOvertureSources, pickTallestOvertureProps } from "./overtureSources";

export const OVERTURE_BUILDING_ZOOM = 14;
const MIN_AREA = 4;
const SLIVER_AREA_M2 = 2;
const MAX_BUILDINGS = 4000;

export type OvertureFetchStats = {
  release: string;
  tileCount: number;
  fetchMs: number;
  fragmentCount: number;
  buildingCount: number;
  hasMicrosoftFootprints: boolean;
};

type Fragment = {
  id: string;
  ring: Ring;
  holes: Ring[];
  props: Record<string, unknown>;
  microsoft: boolean;
  osmWayIds: number[];
};

function stableNumericId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tileRange(bounds: { south: number; west: number; north: number; east: number }, z: number) {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const yFor = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

function ringFromGeoJson(
  coordinates: number[][][],
  origin: LonLat,
  half: number,
): { ring: Ring; holes: Ring[] } | null {
  const toRing = (loop: number[][]): Ring => {
    const raw: Pt[] = loop.map(([lon, lat]) => toLocal(lat, lon, origin));
    const points = dedupeConsecutive(raw, 0.15);
    if (points.length >= 2) {
      const a = points[0];
      const b = points[points.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.2) points.push([a[0], a[1]]);
    }
    return points;
  };
  const outer = clipPolygon(toRing(coordinates[0]), -half, half);
  if (outer.length < 3 || Math.abs(signedArea(outer)) < MIN_AREA) return null;
  const holes = coordinates
    .slice(1)
    .map((loop) => clipPolygon(toRing(loop), -half, half))
    .filter((hole) => hole.length >= 3 && Math.abs(signedArea(hole)) >= MIN_AREA);
  return { ring: outer, holes };
}

function fragmentsFromTile(
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  origin: LonLat,
  half: number,
): Fragment[] {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers.building;
  if (!layer) return [];
  const out: Fragment[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const props = feature.properties as Record<string, unknown>;
    if (props.is_underground === true) continue;
    const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
    if (!id) continue;
    const geo = feature.toGeoJSON(x, y, z);
    if (geo.geometry.type !== "Polygon" && geo.geometry.type !== "MultiPolygon") continue;
    const polys =
      geo.geometry.type === "Polygon" ? [geo.geometry.coordinates] : geo.geometry.coordinates;
    const sourceMeta = parseOvertureSources(props.sources);
    const microsoft =
      sourceMeta.microsoft ||
      String(props["@geometry_source"] ?? "")
        .toLowerCase()
        .includes("microsoft");
    for (const coordinates of polys) {
      const converted = ringFromGeoJson(coordinates, origin, half);
      if (!converted) continue;
      out.push({
        id,
        ring: converted.ring,
        holes: converted.holes,
        props,
        microsoft,
        osmWayIds: sourceMeta.osmWayIds,
      });
    }
  }
  return out;
}

type MultiPoly = polygonClipping.MultiPolygon;

function asMultiPoly(ring: Ring, holes: Ring[]): MultiPoly {
  const outer = openRing(ring).map((point) => [point[0], point[1]] as [number, number]);
  if (outer.length < 3) return [];
  const closed = [...outer];
  if (closed[0][0] !== closed[closed.length - 1][0] || closed[0][1] !== closed[closed.length - 1][1]) {
    closed.push(closed[0]);
  }
  const holeRings = holes
    .map((hole) => {
      const open = openRing(hole).map((point) => [point[0], point[1]] as [number, number]);
      if (open.length < 3) return null;
      const closedHole = [...open];
      if (
        closedHole[0][0] !== closedHole[closedHole.length - 1][0] ||
        closedHole[0][1] !== closedHole[closedHole.length - 1][1]
      ) {
        closedHole.push(closedHole[0]);
      }
      return closedHole;
    })
    .filter((hole): hole is [number, number][] => hole !== null);
  return [[closed, ...holeRings]];
}

function ringFromMulti(multi: MultiPoly, dropSliverArea: number): { ring: Ring; holes: Ring[] }[] {
  const out: { ring: Ring; holes: Ring[] }[] = [];
  for (const polygon of multi) {
    if (polygon.length === 0) continue;
    const outerCoords = polygon[0];
    const ring: Ring = outerCoords.map(([east, north]) => [east, north] as Pt);
    const area = Math.abs(signedArea(ring));
    if (area < dropSliverArea) continue;
    const holes: Ring[] = polygon.slice(1).map((hole) => hole.map(([east, north]) => [east, north] as Pt));
    out.push({ ring, holes });
  }
  return out;
}

/** Union tile fragments by Overture id and drop tile-buffer slivers under 2 m². */
export function reassembleBuildingFragments(fragments: Fragment[]): Fragment[] {
  const byId = new Map<string, Fragment[]>();
  for (const fragment of fragments) {
    const bucket = byId.get(fragment.id);
    if (bucket) bucket.push(fragment);
    else byId.set(fragment.id, [fragment]);
  }
  const merged: Fragment[] = [];
  for (const [id, parts] of byId) {
    let union: MultiPoly = [];
    const props = pickTallestOvertureProps(parts);
    let microsoft = parts.some((part) => part.microsoft);
    const osmWayIds = [...new Set(parts.flatMap((part) => part.osmWayIds))];
    for (const part of parts) {
      union = polygonClipping.union(union, asMultiPoly(part.ring, part.holes)) as MultiPoly;
      if (part.microsoft) microsoft = true;
    }
    const rings = ringFromMulti(union, SLIVER_AREA_M2);
    if (rings.length === 0) continue;
    const primary = rings.reduce((best, current) =>
      Math.abs(signedArea(current.ring)) > Math.abs(signedArea(best.ring)) ? current : best,
    );
    merged.push({
      id,
      ring: primary.ring,
      holes: primary.holes,
      props,
      microsoft,
      osmWayIds,
    });
  }
  return merged;
}

function tagsFromOverture(props: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {};
  if (typeof props.class === "string") tags.building = props.class;
  if (typeof props.subtype === "string") tags["building:use"] = props.subtype;
  if (typeof props.use === "string") tags["building:use"] = props.use;
  return tags;
}

function fragmentToBuilding(fragment: Fragment): BuildingFeat {
  const tags = tagsFromOverture(fragment.props);
  const tagged = classify(tags);
  const props = fragment.props as Record<string, unknown>;
  const areaM2 = footprintArea(fragment.ring, fragment.holes);
  const heightOpts = { footprintAreaM2: areaM2 };
  const height = overtureBuildingHeight(props, heightOpts);
  const minBase = overtureMinHeightM(props, heightOpts);
  const extrusionHeight = Math.max(1, height - minBase);
  const building: BuildingFeat = {
    id: stableNumericId(fragment.id),
    overtureId: fragment.id,
    osmWayIds: fragment.osmWayIds.length > 0 ? fragment.osmWayIds : undefined,
    ring: fragment.ring,
    holes: fragment.holes,
    height,
    heightFromFallback: overtureHeightUsesFallback(props),
    use: tagged ?? "unclassified",
    source: tagged ? "osm_tag" : "none",
  };
  if (minBase > 0.5) {
    building.extrusionParts = [{ ring: fragment.ring, holes: fragment.holes, height: extrusionHeight, base: minBase }];
  }
  return building;
}

export function findOvertureBuildingByOsmWayId(
  buildings: BuildingFeat[],
  osmWayId: number,
): BuildingFeat | undefined {
  return buildings.find((building) => building.osmWayIds?.includes(osmWayId));
}

/** Prefer a footprint containing the tower coordinate; falls back to max intersection area. */
export function findOvertureBuildingForOsmFootprint(
  buildings: BuildingFeat[],
  seed: { ring: Ring; holes: Ring[] },
  at: Pt,
): BuildingFeat | null {
  for (const building of buildings) {
    if (pointInPolygon(at, building.ring, building.holes)) return building;
  }
  let best: BuildingFeat | null = null;
  let bestArea = 4;
  for (const building of buildings) {
    const area = intersectionAreaM2(seed, building);
    if (area > bestArea) {
      bestArea = area;
      best = building;
    }
  }
  return best;
}

export async function fetchOvertureBuildingsForCut(
  bounds: { south: number; west: number; north: number; east: number },
  origin: LonLat,
  sideM: number,
  signal?: AbortSignal,
): Promise<{ buildings: BuildingFeat[]; stats: OvertureFetchStats; buildingCapHit: boolean }> {
  const half = sideM / 2;
  const t0 = performance.now();
  const release = await resolveOvertureRelease(signal);
  const pmtiles = new PMTiles(overtureBuildingsUrl(release));
  const tiles = tileRange(bounds, OVERTURE_BUILDING_ZOOM);
  const tileResults = await Promise.all(
    tiles.map(async ({ z, x, y }) => {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const tile = await pmtiles.getZxy(z, x, y, signal);
      if (!tile?.data) return [] as Fragment[];
      return fragmentsFromTile(tile.data, z, x, y, origin, half);
    }),
  );
  const fragments = tileResults.flat();
  const merged = reassembleBuildingFragments(fragments);
  let buildings = merged.map(fragmentToBuilding);
  let buildingCapHit = false;
  buildings = dedupeBuildings(buildings);
  if (buildings.length > MAX_BUILDINGS) {
    buildingCapHit = true;
    buildings = buildings
      .slice()
      .sort((a, b) => Math.abs(signedArea(b.ring)) - Math.abs(signedArea(a.ring)))
      .slice(0, MAX_BUILDINGS);
  }
  const fetchMs = performance.now() - t0;
  return {
    buildings,
    buildingCapHit,
    stats: {
      release,
      tileCount: tiles.length,
      fetchMs,
      fragmentCount: fragments.length,
      buildingCount: buildings.length,
      hasMicrosoftFootprints: merged.some((item) => item.microsoft),
    },
  };
}
