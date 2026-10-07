import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import {
  clipAreaToSiteFrame,
  clipPolylineSiteFrame,
  DEFAULT_SITE_FRAME_SHAPE,
  pointInSiteFrame,
  type SiteFrameShape,
} from "./siteFrame";
import { waterFallbackFromCenterlines, type WaterCenterline } from "./waterRibbonFallback";
import { dedupeAreas } from "./footprints";
import { dedupeConsecutive, polylineLength, signedArea, toLocal } from "./geo";
import { reassembleBuildingFragments } from "./overtureBuildings";
import {
  canopyKindFromLandCover,
  isGreenLandUse,
  isOvertureWaterLine,
  isOvertureWaterPolygon,
  treeTagsFromLand,
} from "./overtureBaseMapping";
import { overtureBaseUrl, resolveOvertureRelease } from "./overtureRelease";
import { treeSize } from "./trees";
import type { CanopyPatch, TreeContext } from "./parseOsm";
import { stableNumericId, tileRange } from "./overtureTiles";
import type { AreaFeat, LonLat, Pt, Ring, TreeFeat } from "../types";

export const OVERTURE_BASE_ZOOM = 13;
const MIN_AREA = 4;

export type OvertureBaseStats = {
  release: string;
  tileCount: number;
  fetchMs: number;
  waterCount: number;
  greenCount: number;
  overtureTreeCount: number;
  hasEsaLandCover: boolean;
};

type PolyFragment = {
  id: string;
  ring: Ring;
  holes: Ring[];
  props: Record<string, unknown>;
  microsoft: boolean;
  osmWayIds: number[];
};

function mergePolyFragments(fragments: PolyFragment[]): PolyFragment[] {
  const merged = reassembleBuildingFragments(
    fragments.map((f) => ({
      ...f,
      props: f.props,
    })),
  );
  return merged.map((m) => ({
    id: m.id,
    ring: m.ring,
    holes: m.holes,
    props: m.props,
    microsoft: m.microsoft,
    osmWayIds: [],
  }));
}

function ringFromGeoJson(
  coordinates: number[][][],
  origin: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
) {
  const toRing = (loop: number[][]): Ring =>
    dedupeConsecutive(
      loop.map(([lon, lat]) => toLocal(lat, lon, origin)),
      0.12,
    );
  const outerRaw = toRing(coordinates[0]);
  const holeRaws = coordinates.slice(1).map((loop) => toRing(loop));
  const clipped = clipAreaToSiteFrame(outerRaw, holeRaws, sideM, frameShape);
  if (!clipped || clipped[0]!.length < 3 || Math.abs(signedArea(clipped[0]!)) < MIN_AREA) return null;
  const outer = clipped[0]!;
  const holes = clipped
    .slice(1)
    .filter((hole) => hole.length >= 3 && Math.abs(signedArea(hole)) >= MIN_AREA);
  return { ring: outer, holes };
}

function polysFromLayer(
  layerName: string,
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  origin: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
): PolyFragment[] {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers[layerName];
  if (!layer) return [];
  const out: PolyFragment[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const props = feature.properties as Record<string, unknown>;
    const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
    if (!id) continue;
    const geo = feature.toGeoJSON(x, y, z);
    const polys =
      geo.geometry.type === "Polygon"
        ? [geo.geometry.coordinates]
        : geo.geometry.type === "MultiPolygon"
          ? geo.geometry.coordinates
          : [];
    for (const coordinates of polys) {
      const converted = ringFromGeoJson(coordinates, origin, sideM, frameShape);
      if (!converted) continue;
      out.push({
        id,
        ring: converted.ring,
        holes: converted.holes,
        props,
        microsoft: false,
        osmWayIds: [],
      });
    }
  }
  return out;
}

function pushTree(
  trees: TreeFeat[],
  id: number,
  at: Pt,
  tags: Record<string, string>,
  sideM: number,
  frameShape: SiteFrameShape,
) {
  if (!pointInSiteFrame(at, sideM, frameShape)) return;
  const size = treeSize(tags);
  trees.push({
    id,
    at,
    height_m: size.height_m,
    crown_diameter_m: size.crown_diameter_m,
    trunk_diameter_m: size.trunk_diameter_m,
    sizeSource: size.sizeSource,
    tier: "osm",
  });
}

function waterCenterlinesFromLayer(
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  origin: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
): WaterCenterline[] {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers.water;
  if (!layer) return [];
  const out: WaterCenterline[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const props = feature.properties as Record<string, unknown>;
    if (!isOvertureWaterLine(props)) continue;
    const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
    const geo = feature.toGeoJSON(x, y, z);
    if (geo.geometry.type !== "LineString") continue;
    const raw: Pt[] = dedupeConsecutive(
      geo.geometry.coordinates.map(([lon, lat]) => toLocal(lat, lon, origin)),
      0.08,
    );
    for (const part of clipPolylineSiteFrame(raw, sideM, frameShape)) {
      if (polylineLength(part) < 2) continue;
      out.push({ id: `${id}:${out.length}`, line: part, props });
    }
  }
  return out;
}

function treesFromLandTile(
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  origin: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
): TreeFeat[] {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers.land;
  if (!layer) return [];
  const trees: TreeFeat[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const props = feature.properties as Record<string, unknown>;
    if (String(props.class ?? "").toLowerCase() !== "tree") continue;
    const geo = feature.toGeoJSON(x, y, z);
    if (geo.geometry.type !== "Point") continue;
    const [lon, lat] = geo.geometry.coordinates;
    const at = toLocal(lat, lon, origin);
    const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
    pushTree(trees, stableNumericId(id), at, treeTagsFromLand(props), sideM, frameShape);
  }
  return trees;
}

export async function fetchOvertureBaseForCut(
  bounds: { south: number; west: number; north: number; east: number },
  origin: LonLat,
  sideM: number,
  options: { waterGreen: boolean; trees: boolean; frameShape?: SiteFrameShape },
  signal?: AbortSignal,
): Promise<{
  areas: AreaFeat[];
  treeContext: TreeContext;
  overtureTrees: TreeFeat[];
  stats: OvertureBaseStats;
}> {
  const frameShape = options.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const t0 = performance.now();
  const release = await resolveOvertureRelease(signal);
  const pmtiles = new PMTiles(overtureBaseUrl(release));
  const tiles = tileRange(bounds, OVERTURE_BASE_ZOOM);
  const waterFrags: PolyFragment[] = [];
  const waterCenterlines: WaterCenterline[] = [];
  const greenFrags: PolyFragment[] = [];
  const canopyFrags: PolyFragment[] = [];
  const overtureTrees: TreeFeat[] = [];
  let hasEsaLandCover = false;

  for (const { z, x, y } of tiles) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const tile = await pmtiles.getZxy(z, x, y, signal);
    if (!tile?.data) continue;
    if (options.trees) overtureTrees.push(...treesFromLandTile(tile.data, z, x, y, origin, sideM, frameShape));
    if (!options.waterGreen) continue;
    waterFrags.push(...polysFromLayer("water", tile.data, z, x, y, origin, sideM, frameShape));
    waterCenterlines.push(...waterCenterlinesFromLayer(tile.data, z, x, y, origin, sideM, frameShape));
    greenFrags.push(...polysFromLayer("land_use", tile.data, z, x, y, origin, sideM, frameShape));
    const cover = polysFromLayer("land_cover", tile.data, z, x, y, origin, sideM, frameShape);
    for (const frag of cover) {
      const kind = canopyKindFromLandCover(String(frag.props.subtype ?? ""));
      if (kind) {
        hasEsaLandCover = true;
        canopyFrags.push({ ...frag, props: { ...frag.props, __canopy: kind } });
      }
    }
  }

  const areas: AreaFeat[] = [];
  if (options.waterGreen) {
    const polygonWater: AreaFeat[] = [];
    for (const merged of mergePolyFragments(waterFrags)) {
      if (!isOvertureWaterPolygon(merged.props, merged.ring)) continue;
      polygonWater.push({
        id: stableNumericId(merged.id),
        kind: "water",
        ring: merged.ring,
        holes: merged.holes,
      });
    }
    areas.push(...polygonWater);
    areas.push(...waterFallbackFromCenterlines(waterCenterlines, polygonWater));
    for (const merged of mergePolyFragments(greenFrags)) {
      if (!isGreenLandUse(merged.props)) continue;
      areas.push({
        id: stableNumericId(merged.id),
        kind: "green",
        ring: merged.ring,
        holes: merged.holes,
      });
    }
  }

  const canopy: CanopyPatch[] = mergePolyFragments(canopyFrags)
    .map((merged) => {
      const kind = merged.props.__canopy as CanopyPatch["kind"] | undefined;
      if (!kind) return null;
      return { ring: merged.ring, holes: merged.holes, kind };
    })
    .filter((p): p is CanopyPatch => p !== null);

  const treeContext: TreeContext = {
    canopy,
    buildings: [],
    water: areas.filter((a) => a.kind === "water").map((a) => ({ ring: a.ring, holes: a.holes })),
    roads: [],
  };

  const areasKept = dedupeAreas(areas);
  return {
    areas: areasKept,
    treeContext,
    overtureTrees,
    stats: {
      release,
      tileCount: tiles.length,
      fetchMs: performance.now() - t0,
      waterCount: areasKept.filter((a) => a.kind === "water").length,
      greenCount: areasKept.filter((a) => a.kind === "green").length,
      overtureTreeCount: overtureTrees.length,
      hasEsaLandCover,
    },
  };
}
