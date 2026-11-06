import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import RBush from "rbush";
import * as THREE from "three";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";
import { toLocal } from "./geo";
import { sampleTerrain } from "./terrain";
import { SURFACE } from "./surfaceLayers";
import type { MultiPolygon } from "polygon-clipping";
import type { CityModel, LonLat } from "../types";

/**
 * Vicmap property parcel outlines for the 3D massing view.
 *
 * Ported from the Demographics Explorer People map (PR 197,
 * `src/lib/demographicsParcelsPmtiles.ts` + `useDemographicsParcels`): same
 * `demographics-parcels.pmtiles` archive, same z14→z12 tile walk and id de-dupe,
 * same rbush bbox index. Only the ring geometry is kept here.
 */
export const PARCEL_OUTLINES_PMTILES_URL = `${import.meta.env.BASE_URL}demographics-parcels.pmtiles`;
const PARCELS_FETCH_ZOOMS = [14, 13, 12] as const;

export type ParcelOutline = { id: string; ring: [number, number][] };
type Bbox = { south: number; west: number; north: number; east: number };
export type IndexedParcel = ParcelOutline & { minX: number; minY: number; maxX: number; maxY: number };

function tileRange(bounds: Bbox, z: number) {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const yFor = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  return tiles;
}

let sharedPmtiles: PMTiles | null = null;
function pmtilesClient(): PMTiles {
  if (!sharedPmtiles) sharedPmtiles = new PMTiles(new EnrichmentPmtilesSource(PARCEL_OUTLINES_PMTILES_URL));
  return sharedPmtiles;
}

export async function fetchParcelOutlines(bounds: Bbox, signal?: AbortSignal): Promise<ParcelOutline[]> {
  const pmtiles = pmtilesClient();
  const byId = new Map<string, ParcelOutline>();
  const seen = new Set<string>();
  for (const z of PARCELS_FETCH_ZOOMS) {
    for (const { x, y } of tileRange(bounds, z)) {
      const key = `${z}/${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (signal?.aborted) return [...byId.values()];
      const response = await pmtiles.getZxy(z, x, y, signal);
      if (!response?.data) continue;
      const layer = new VectorTile(new PbfReader(response.data)).layers.parcels;
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const geo = layer.feature(i).toGeoJSON(x, y, z) as GeoJSON.Feature;
        const props = geo.properties ?? {};
        const id = String(props.id ?? props.parcel_pfi ?? `${i}-${x}-${y}`);
        if (byId.has(id)) continue;
        const g = geo.geometry;
        if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
        const raw = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0];
        if (!raw || raw.length < 3) continue;
        byId.set(id, { id, ring: raw.map(([lon, lat]) => [lon, lat] as [number, number]) });
      }
    }
  }
  return [...byId.values()];
}

export function buildParcelOutlineIndex(parcels: ParcelOutline[]): RBush<IndexedParcel> {
  const tree = new RBush<IndexedParcel>();
  tree.load(
    parcels.map((p) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [lon, lat] of p.ring) {
        minX = Math.min(minX, lon); maxX = Math.max(maxX, lon);
        minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
      }
      return { ...p, minX, minY, maxX, maxY };
    }),
  );
  return tree;
}

export function searchParcelOutlines(index: RBush<IndexedParcel>, b: Bbox): ParcelOutline[] {
  return index.search({ minX: b.west, minY: b.south, maxX: b.east, maxY: b.north });
}

/** Liang–Barsky clip of segment a→b to the square [-h, h]². */
export function clipSegmentToSquare(a: [number, number], b: [number, number], h: number): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] + h],
    [dx, h - a[0]],
    [-dy, a[1] + h],
    [dy, h - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

export const PARCEL_OUTLINES_OBJECT = "MassingParcelOutlines";

type OutlineStyle = {
  color: THREE.ColorRepresentation;
  opacity: number;
  liftM: number;
  renderOrderOffset: number;
  name: string;
};

function appendLocalRingSegments(
  pos: number[],
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  ring: [number, number][],
  origin: LonLat,
  style: OutlineStyle,
) {
  const half = model.sideM / 2;
  const height = (e: number, n: number) =>
    (model.terrain ? sampleTerrain(model.terrain, e, n, model.sideM) : 0) + style.liftM;
  const local = ring.map(([lon, lat]) => toLocal(lat, lon, origin));
  for (let i = 0; i < local.length - 1; i++) {
    const seg = clipSegmentToSquare(local[i]!, local[i + 1]!, half);
    if (!seg) continue;
    const [[e0, n0], [e1, n1]] = seg;
    pos.push(e0, height(e0, n0), -n0, e1, height(e1, n1), -n1);
  }
}

function buildLineSegments(
  pos: number[],
  style: OutlineStyle,
  parcelCount: number,
): THREE.LineSegments | null {
  if (!pos.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const material = new THREE.LineBasicMaterial({
    color: style.color,
    transparent: true,
    opacity: style.opacity,
    depthTest: true,
    depthWrite: false,
  });
  material.toneMapped = false;
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = style.name;
  lines.renderOrder = SURFACE.rail.renderOrder + style.renderOrderOffset;
  lines.userData.noScenePick = true;
  lines.userData.parcelCount = parcelCount;
  lines.raycast = () => {};
  return lines;
}

const BASE_PARCEL_STYLE = {
  opacity: 0.92,
  liftM: SURFACE.rail.lift + 0.22,
  renderOrderOffset: 2,
  name: PARCEL_OUTLINES_OBJECT,
} satisfies Omit<OutlineStyle, "color">;

/** Ground-draped strokes in the scene local frame (east, up, -north). */
export function buildParcelOutlineLines(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  color: THREE.ColorRepresentation,
): THREE.LineSegments | null {
  const origin: LonLat = model.center;
  const pos: number[] = [];
  const style = { ...BASE_PARCEL_STYLE, color };
  for (const parcel of parcels) appendLocalRingSegments(pos, model, parcel.ring, origin, style);
  return buildLineSegments(pos, style, parcels.length);
}

export function buildParcelSubsetOutlineLines(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  style: OutlineStyle,
): THREE.LineSegments | null {
  const origin: LonLat = model.center;
  const pos: number[] = [];
  for (const parcel of parcels) appendLocalRingSegments(pos, model, parcel.ring, origin, style);
  return buildLineSegments(pos, style, parcels.length);
}

export function buildLocalBoundaryOutlineLines(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  multi: MultiPolygon,
  style: OutlineStyle,
): THREE.LineSegments | null {
  const pos: number[] = [];
  for (const polygon of multi) {
    const outer = polygon[0] ?? [];
    for (let i = 0; i < outer.length - 1; i++) {
      const a = outer[i]!;
      const b = outer[i + 1]!;
      const height = (e: number, n: number) =>
        (model.terrain ? sampleTerrain(model.terrain, e, n, model.sideM) : 0) + style.liftM;
      pos.push(a[0], height(a[0], a[1]), -a[1], b[0], height(b[0], b[1]), -b[1]);
    }
  }
  return buildLineSegments(pos, style, multi.length);
}
