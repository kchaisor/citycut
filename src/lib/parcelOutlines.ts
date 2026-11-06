import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import RBush from "rbush";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";
import { fromLocal, openRing, toLocal } from "./geo";
import { sampleTerrain } from "./terrain";
import { SURFACE } from "./surfaceLayers";
import type { MultiPolygon } from "polygon-clipping";
import type { CityModel, LonLat, Pt } from "../types";
import {
  AXO_CADASTRE_MAX_PAGES,
  AXO_CADASTRE_PAGE_SIZE,
  cadastreQueryUrl,
} from "./explodedAxoCadastre";
import { fetchTierJson } from "./useCascade";
import { polygonsFromGeometry } from "./vicmapSiteParcel";

export const PARCEL_OUTLINES_PMTILES_URL = `${import.meta.env.BASE_URL}demographics-parcels.pmtiles`;
export const PARCEL_OUTLINES_MANIFEST_URL = `${import.meta.env.BASE_URL}demographics-parcels-manifest.json`;
const PARCELS_FETCH_ZOOMS = [14, 13, 12] as const;

export const PARCEL_OUTLINE_RENDER_ORDER = SURFACE.building.renderOrder + 140;
export const PARCEL_FILL_RENDER_ORDER = PARCEL_OUTLINE_RENDER_ORDER - 2;
const PARCEL_FILL_TINT_ORDER = PARCEL_OUTLINE_RENDER_ORDER - 3;
const PARCEL_FILL_HOVER_ORDER = PARCEL_OUTLINE_RENDER_ORDER - 1;
const PARCEL_FILL_SELECTED_ORDER = PARCEL_OUTLINE_RENDER_ORDER + 1;
const PARCEL_FILL_BOUNDARY_ORDER = PARCEL_OUTLINE_RENDER_ORDER + 4;

export type ParcelOutline = { id: string; ring: [number, number][] };
type Bbox = { south: number; west: number; north: number; east: number };
export type IndexedParcel = ParcelOutline & { minX: number; minY: number; maxX: number; maxY: number };

export type MassingParcelOutlineBundle = {
  objects: THREE.Object3D[];
  lineMaterials: LineMaterial[];
  segmentCount: number;
};

type WideLineStyle = {
  color: THREE.ColorRepresentation;
  opacity: number;
  liftM: number;
  lineWidthM: number;
  renderOrder: number;
  name: string;
};

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

export async function fetchVicmapParcelOutlines(
  model: Pick<CityModel, "center" | "sideM" | "region">,
  signal?: AbortSignal,
): Promise<ParcelOutline[]> {
  if (model.region === "nsw") return [];
  const byId = new Map<string, ParcelOutline>();
  for (let page = 0; page < AXO_CADASTRE_MAX_PAGES; page += 1) {
    const res = await fetchTierJson(cadastreQueryUrl(model as CityModel, page * AXO_CADASTRE_PAGE_SIZE), {
      signal,
      timeoutMs: 20_000,
    });
    if (!res.ok) break;
    const body = res.body as {
      features?: { geometry?: unknown; properties?: Record<string, unknown> | null }[];
      properties?: { exceededTransferLimit?: boolean };
      exceededTransferLimit?: boolean;
    };
    if (!body?.features) break;
    for (const feature of body.features) {
      const props = feature.properties ?? {};
      const road = String(props.parcel_road ?? "")
        .trim()
        .toUpperCase();
      if (road === "Y") continue;
      const id = String(props.parcel_pfi ?? "");
      if (!id || byId.has(id)) continue;
      const polys = polygonsFromGeometry(feature.geometry as never, model.center);
      const outer = polys[0]?.outer;
      if (!outer || outer.length < 3) continue;
      const ring: [number, number][] = [];
      for (const [e, n] of outer) {
        const { lon, lat } = fromLocal([e, n], model.center);
        ring.push([lon, lat]);
      }
      if (ring.length >= 3) byId.set(id, { id, ring });
    }
    const more = body.properties?.exceededTransferLimit ?? body.exceededTransferLimit ?? false;
    if (!more) break;
  }
  return [...byId.values()];
}

export function cutIntersectsDemographicsArchive(bounds: Bbox, archive: Bbox): boolean {
  return !(bounds.east < archive.west || bounds.west > archive.east || bounds.north < archive.south || bounds.south > archive.north);
}

export async function fetchParcelOutlinesForCut(
  model: Pick<CityModel, "center" | "sideM" | "region">,
  bounds: Bbox,
  signal?: AbortSignal,
): Promise<{ parcels: ParcelOutline[]; source: "pmtiles" | "vicmap" | "pmtiles+vicmap" }> {
  let archiveBbox: Bbox | null = null;
  try {
    const res = await fetch(PARCEL_OUTLINES_MANIFEST_URL, { signal });
    if (res.ok) {
      const manifest = (await res.json()) as { bbox?: Bbox };
      if (manifest.bbox) archiveBbox = manifest.bbox;
    }
  } catch {
    archiveBbox = null;
  }
  const inArchive = archiveBbox ? cutIntersectsDemographicsArchive(bounds, archiveBbox) : false;
  if (!inArchive) {
    const vicmapParcels = await fetchVicmapParcelOutlines(model, signal);
    return { parcels: vicmapParcels, source: "vicmap" };
  }
  const pmtilesParcels = await fetchParcelOutlines(bounds, signal);
  if (pmtilesParcels.length >= 80) return { parcels: pmtilesParcels, source: "pmtiles" };
  const vicmapParcels = await fetchVicmapParcelOutlines(model, signal);
  if (pmtilesParcels.length === 0) return { parcels: vicmapParcels, source: "vicmap" };
  const merged = new Map<string, ParcelOutline>();
  for (const parcel of pmtilesParcels) merged.set(parcel.id, parcel);
  for (const parcel of vicmapParcels) merged.set(parcel.id, parcel);
  return { parcels: [...merged.values()], source: "pmtiles+vicmap" };
}

export function buildParcelOutlineIndex(parcels: ParcelOutline[]): RBush<IndexedParcel> {
  const tree = new RBush<IndexedParcel>();
  tree.load(
    parcels.map((p) => {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [lon, lat] of p.ring) {
        minX = Math.min(minX, lon);
        maxX = Math.max(maxX, lon);
        minY = Math.min(minY, lat);
        maxY = Math.max(maxY, lat);
      }
      return { ...p, minX, minY, maxX, maxY };
    }),
  );
  return tree;
}

export function searchParcelOutlines(index: RBush<IndexedParcel>, b: Bbox): ParcelOutline[] {
  return index.search({ minX: b.west, minY: b.south, maxX: b.east, maxY: b.north });
}

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

function terrainZ(model: Pick<CityModel, "terrain" | "sideM">, east: number, north: number, liftM: number): number {
  return (model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) : 0) + liftM;
}

function appendLocalRingSegments(
  pos: number[],
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  ring: [number, number][],
  origin: LonLat,
  liftM: number,
) {
  const half = model.sideM / 2;
  const local = ring.map(([lon, lat]) => toLocal(lat, lon, origin));
  for (let i = 0; i < local.length - 1; i++) {
    const seg = clipSegmentToSquare(local[i]!, local[i + 1]!, half);
    if (!seg) continue;
    const [[e0, n0], [e1, n1]] = seg;
    pos.push(e0, terrainZ(model, e0, n0, liftM), -n0, e1, terrainZ(model, e1, n1, liftM), -n1);
  }
}

function buildWideLineSegments(
  pos: number[],
  style: WideLineStyle,
  segmentCount: number,
): { object: LineSegments2; material: LineMaterial } | null {
  if (!pos.length) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(pos);
  const material = new LineMaterial({
    color: new THREE.Color(style.color).getHex(),
    linewidth: style.lineWidthM,
    worldUnits: true,
    transparent: style.opacity < 1,
    opacity: style.opacity,
    depthTest: false,
    depthWrite: false,
  });
  material.toneMapped = false;
  const lines = new LineSegments2(geometry, material);
  lines.name = style.name;
  lines.frustumCulled = false;
  lines.renderOrder = style.renderOrder;
  lines.userData.noScenePick = true;
  lines.userData.parcelCount = segmentCount;
  lines.raycast = () => {};
  return { object: lines, material };
}

function collectRingPositions(
  pos: number[],
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  ring: [number, number][],
  origin: LonLat,
  liftM: number,
) {
  appendLocalRingSegments(pos, model, ring, origin, liftM);
}

function buildLocalFillMesh(
  model: Pick<CityModel, "terrain" | "sideM">,
  localRing: Pt[],
  color: THREE.ColorRepresentation,
  opacity: number,
  liftM: number,
  name: string,
  renderOrder: number = PARCEL_FILL_RENDER_ORDER,
): THREE.Mesh | null {
  const local = openRing(localRing);
  if (local.length < 3) return null;
  const shape = new THREE.Shape(local.map(([e, n]) => new THREE.Vector2(e, n)));
  const triangles = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
  if (!triangles.length) return null;
  const positions: number[] = [];
  const points = shape.getPoints();
  for (const [a, b, c] of triangles) {
    for (const idx of [a, b, c]) {
      const p = points[idx];
      if (!p) continue;
      const e = p.x;
      const n = p.y;
      positions.push(e, terrainZ(model, e, n, liftM), -n);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = renderOrder;
  mesh.userData.noScenePick = true;
  mesh.raycast = () => {};
  return mesh;
}

function buildFillMesh(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  ring: [number, number][],
  origin: LonLat,
  color: THREE.ColorRepresentation,
  opacity: number,
  liftM: number,
  name: string,
  renderOrder: number = PARCEL_FILL_RENDER_ORDER,
): THREE.Mesh | null {
  const local = openRing(ring.map(([lon, lat]) => toLocal(lat, lon, origin)));
  if (local.length < 3) return null;
  const shape = new THREE.Shape(local.map(([e, n]) => new THREE.Vector2(e, n)));
  const triangles = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
  if (!triangles.length) return null;
  const positions: number[] = [];
  const points = shape.getPoints();
  for (const [a, b, c] of triangles) {
    for (const idx of [a, b, c]) {
      const p = points[idx];
      if (!p) continue;
      const e = p.x;
      const n = p.y;
      positions.push(e, terrainZ(model, e, n, liftM), -n);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = renderOrder;
  mesh.userData.noScenePick = true;
  mesh.raycast = () => {};
  return mesh;
}

function bundleFromPositions(
  pos: number[],
  style: WideLineStyle,
  segmentCount: number,
  casingColor?: THREE.ColorRepresentation,
  casingOptions?: { widthMul?: number; opacity?: number },
): MassingParcelOutlineBundle {
  const lineMaterials: LineMaterial[] = [];
  const objects: THREE.Object3D[] = [];
  const widthMul = casingOptions?.widthMul ?? 1.65;
  const casingOpacity = casingOptions?.opacity ?? 0.9;
  if (casingColor) {
    const casing = buildWideLineSegments(pos, {
      ...style,
      color: casingColor,
      opacity: casingOpacity,
      lineWidthM: style.lineWidthM * widthMul,
      renderOrder: style.renderOrder - 1,
      name: `${style.name}Casing`,
    }, segmentCount);
    if (casing) {
      objects.push(casing.object);
      lineMaterials.push(casing.material);
    }
  }
  const built = buildWideLineSegments(pos, style, segmentCount);
  if (built) {
    objects.push(built.object);
    lineMaterials.push(built.material);
  }
  return { objects, lineMaterials, segmentCount: pos.length / 6 };
}

export function buildMassingParcelOutlineBundle(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  outlineColor: THREE.ColorRepresentation,
  options?: {
    fillColor?: THREE.ColorRepresentation;
    fillOpacity?: number;
    casingColor?: THREE.ColorRepresentation;
    lineWidthM?: number;
    casingWidthMul?: number;
    casingOpacity?: number;
  },
): MassingParcelOutlineBundle {
  const origin = model.center;
  const pos: number[] = [];
  const liftM = SURFACE.rail.lift + 0.35;
  const objects: THREE.Object3D[] = [];
  const lineMaterials: LineMaterial[] = [];
  const fillOpacity = options?.fillOpacity ?? 0.08;
  if (options?.fillColor) {
    for (const parcel of parcels) {
      const fill = buildFillMesh(
        model,
        parcel.ring,
        origin,
        options.fillColor,
        fillOpacity,
        liftM - 0.05,
        "MassingParcelTintFill",
        PARCEL_FILL_TINT_ORDER,
      );
      if (fill) objects.push(fill);
    }
  }
  for (const parcel of parcels) collectRingPositions(pos, model, parcel.ring, origin, liftM);
  const lines = bundleFromPositions(
    pos,
    {
      color: outlineColor,
      opacity: 1,
      liftM,
      lineWidthM: options?.lineWidthM ?? 0.72,
      renderOrder: PARCEL_OUTLINE_RENDER_ORDER,
      name: PARCEL_OUTLINES_OBJECT,
    },
    parcels.length,
    options?.casingColor,
    {
      widthMul: options?.casingWidthMul ?? 1.28,
      opacity: options?.casingOpacity ?? 0.48,
    },
  );
  objects.push(...lines.objects);
  lineMaterials.push(...lines.lineMaterials);
  return { objects, lineMaterials, segmentCount: lines.segmentCount };
}

export function buildMassingParcelHoverBundle(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  lineColor: THREE.ColorRepresentation,
  fillColor: THREE.ColorRepresentation,
  casingColor?: THREE.ColorRepresentation,
): MassingParcelOutlineBundle {
  const origin = model.center;
  const pos: number[] = [];
  const liftM = SURFACE.rail.lift + 0.38;
  const objects: THREE.Object3D[] = [];
  const lineMaterials: LineMaterial[] = [];
  for (const parcel of parcels) {
    const fill = buildFillMesh(model, parcel.ring, origin, fillColor, 0.28, liftM - 0.04, "MassingParcelHoverFill", PARCEL_FILL_HOVER_ORDER);
    if (fill) objects.push(fill);
    collectRingPositions(pos, model, parcel.ring, origin, liftM);
  }
  const lines = bundleFromPositions(
    pos,
    {
      color: lineColor,
      opacity: 1,
      liftM,
      lineWidthM: 0.92,
      renderOrder: PARCEL_OUTLINE_RENDER_ORDER + 1,
      name: "MassingParcelHover",
    },
    parcels.length,
    casingColor,
    { widthMul: 1.32, opacity: 0.58 },
  );
  objects.push(...lines.objects);
  lineMaterials.push(...lines.lineMaterials);
  return { objects, lineMaterials, segmentCount: lines.segmentCount };
}

export function buildMassingParcelSelectionBundle(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  lineColor: THREE.ColorRepresentation,
  fillColor: THREE.ColorRepresentation,
  casingColor?: THREE.ColorRepresentation,
): MassingParcelOutlineBundle {
  const origin = model.center;
  const pos: number[] = [];
  const liftM = SURFACE.rail.lift + 0.42;
  const objects: THREE.Object3D[] = [];
  const lineMaterials: LineMaterial[] = [];
  for (const parcel of parcels) {
    const fill = buildFillMesh(model, parcel.ring, origin, fillColor, 0.42, liftM - 0.04, "MassingParcelSelectedFill", PARCEL_FILL_SELECTED_ORDER);
    if (fill) objects.push(fill);
    collectRingPositions(pos, model, parcel.ring, origin, liftM);
  }
  const lines = bundleFromPositions(
    pos,
    {
      color: lineColor,
      opacity: 1,
      liftM,
      lineWidthM: 1.12,
      renderOrder: PARCEL_OUTLINE_RENDER_ORDER + 3,
      name: "MassingParcelSelected",
    },
    parcels.length,
    casingColor,
    { widthMul: 1.38, opacity: 0.62 },
  );
  objects.push(...lines.objects);
  lineMaterials.push(...lines.lineMaterials);
  return { objects, lineMaterials, segmentCount: lines.segmentCount };
}

export function buildMassingSiteBoundaryBundle(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  multi: MultiPolygon,
  lineColor: THREE.ColorRepresentation,
  fillColor: THREE.ColorRepresentation,
): MassingParcelOutlineBundle {
  const pos: number[] = [];
  const liftM = SURFACE.rail.lift + 0.48;
  const objects: THREE.Object3D[] = [];
  const lineMaterials: LineMaterial[] = [];
  for (const polygon of multi) {
    const outer = polygon[0] ?? [];
    const ring: [number, number][] = outer.map(([e, n]) => [e, n] as [number, number]);
    if (ring.length >= 3) {
      const fill = buildLocalFillMesh(model, ring, fillColor, 0.22, liftM - 0.06, "MassingSiteBoundaryFill", PARCEL_FILL_BOUNDARY_ORDER);
      if (fill) objects.push(fill);
    }
    for (let i = 0; i < outer.length - 1; i++) {
      const a = outer[i]!;
      const b = outer[i + 1]!;
      pos.push(a[0], terrainZ(model, a[0], a[1], liftM), -a[1], b[0], terrainZ(model, b[0], b[1], liftM), -b[1]);
    }
  }
  const lines = bundleFromPositions(pos, {
    color: lineColor,
    opacity: 1,
    liftM,
    lineWidthM: 1.55,
    renderOrder: PARCEL_OUTLINE_RENDER_ORDER + 6,
    name: "MassingSiteBoundary",
  }, multi.length);
  objects.push(...lines.objects);
  lineMaterials.push(...lines.lineMaterials);
  return { objects, lineMaterials, segmentCount: lines.segmentCount };
}

export function buildParcelOutlineLines(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  color: THREE.ColorRepresentation,
): THREE.Object3D | null {
  const bundle = buildMassingParcelOutlineBundle(model, parcels, color);
  return bundle.objects[0] ?? null;
}

export function buildParcelSubsetOutlineLines(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  parcels: ParcelOutline[],
  style: { color: THREE.ColorRepresentation; opacity: number; liftM: number; renderOrderOffset: number; name: string },
): THREE.Object3D | null {
  void style;
  const bundle = buildMassingParcelSelectionBundle(model, parcels, style.color, style.color);
  return bundle.objects.find((o) => o.name === "MassingParcelSelected") ?? null;
}

export function buildLocalBoundaryOutlineLines(
  model: Pick<CityModel, "terrain" | "sideM" | "center">,
  multi: MultiPolygon,
  style: { color: THREE.ColorRepresentation; opacity: number; liftM: number; renderOrderOffset: number; name: string },
): THREE.Object3D | null {
  void style;
  const bundle = buildMassingSiteBoundaryBundle(model, multi, style.color, style.color);
  return bundle.objects.find((o) => o.name === "MassingSiteBoundary") ?? null;
}

export function mergeMassingParcelBundles(...bundles: MassingParcelOutlineBundle[]): MassingParcelOutlineBundle {
  const objects: THREE.Object3D[] = [];
  const lineMaterials: LineMaterial[] = [];
  let segmentCount = 0;
  for (const bundle of bundles) {
    objects.push(...bundle.objects);
    lineMaterials.push(...bundle.lineMaterials);
    segmentCount += bundle.segmentCount;
  }
  return { objects, lineMaterials, segmentCount };
}
