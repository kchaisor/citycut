/**
 * Greater Melbourne trees pre-baked by the monthly job (scripts/build-trees-pmtiles.mjs) into
 * trees.pmtiles on Pages. The app reads a cut's trees from here first; the live Vicmap and City of
 * Melbourne servers are the backup. Vicmap height and crown are stored in half-metre steps.
 */
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";
import type { ComTree } from "./comTrees";
import type { VicmapPoint } from "./vicmapTrees";

export const TREES_PMTILES_URL = `${import.meta.env.BASE_URL}trees.pmtiles`;
export const TREES_MANIFEST_URL = `${import.meta.env.BASE_URL}trees-manifest.json`;

/** Credit for the OSM-derived tree points in the pre-baked file (ODbL). */
export const OSM_TREES_ODBL_CREDIT = "Tree points © OpenStreetMap contributors, ODbL.";

type BBox = { south: number; west: number; north: number; east: number };

export type TreesManifest = {
  schema: number;
  generatedAt: string;
  bbox: BBox;
  zoom: number;
  sourceStamps?: {
    vicmapDataLastEdit?: string | null;
    comDataProcessed?: string | null;
    overtureRelease?: string | null;
  };
};

export type PrebakedOsmPoint = { lon: number; lat: number; sid: number; tags: string | null };

export type PrebakedTrees = {
  vicmap: VicmapPoint[];
  com: ComTree[];
  osm: PrebakedOsmPoint[];
  manifest: TreesManifest;
  tiles: number;
};

export type PrebakeResult = { ok: true; trees: PrebakedTrees } | { ok: false; reason: string };

export type PrebakeArchive = Pick<PMTiles, "getHeader" | "getZxy">;

export type PrebakeDeps = {
  fetchManifest?: (signal?: AbortSignal) => Promise<TreesManifest>;
  archive?: PrebakeArchive;
};

let sharedArchive: PMTiles | null = null;
function defaultArchive(): PMTiles {
  if (!sharedArchive) {
    const url =
      typeof window !== "undefined" ? new URL(TREES_PMTILES_URL, window.location.href).href : TREES_PMTILES_URL;
    sharedArchive = new PMTiles(new EnrichmentPmtilesSource(url));
  }
  return sharedArchive;
}

let manifestPromise: Promise<TreesManifest> | null = null;
async function defaultFetchManifest(signal?: AbortSignal): Promise<TreesManifest> {
  manifestPromise ??= (async () => {
    const response = await fetch(TREES_MANIFEST_URL, { signal });
    if (!response.ok) throw new Error(`the pre-baked tree manifest answered HTTP ${response.status}`);
    return (await response.json()) as TreesManifest;
  })();
  try {
    return await manifestPromise;
  } catch (err) {
    manifestPromise = null;
    throw err;
  }
}

/** YYYY-MM-DD from an ISO date, or null. */
export function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : null;
}

/** Source-note sentence naming the data dates in the pre-baked file. */
export function prebakeSourceNote(manifest: TreesManifest, usedOsm: boolean): string {
  const stamps = manifest.sourceStamps ?? {};
  const parts = [
    isoDay(stamps.vicmapDataLastEdit) ? `Vicmap data ${isoDay(stamps.vicmapDataLastEdit)}` : null,
    isoDay(stamps.comDataProcessed) ? `City of Melbourne data ${isoDay(stamps.comDataProcessed)}` : null,
    usedOsm && stamps.overtureRelease ? `OpenStreetMap via Overture ${stamps.overtureRelease}` : null,
  ].filter(Boolean);
  const built = isoDay(manifest.generatedAt);
  return `Trees read from the pre-baked tree file${built ? ` built ${built}` : ""}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}; Vicmap heights and crowns are rounded to 0.5 m.`;
}

/** Note shown in the Trees panel and Model details whenever the live servers were used instead. */
export function prebakeBackupNote(reason: string): string {
  return `Trees came from the live servers (backup) because the pre-baked tree file could not be used: ${reason}.`;
}

export function bboxCovers(outer: BBox, inner: BBox): boolean {
  return inner.west >= outer.west && inner.east <= outer.east && inner.south >= outer.south && inner.north <= outer.north;
}

export function tilesForBounds(bounds: BBox, z: number): { z: number; x: number; y: number }[] {
  const n = 2 ** z;
  const tx = (lon: number) => Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n)));
  };
  const out: { z: number; x: number; y: number }[] = [];
  for (let x = tx(bounds.west); x <= tx(bounds.east); x++) {
    for (let y = ty(bounds.north); y <= ty(bounds.south); y++) out.push({ z, x, y });
  }
  return out;
}

/**
 * The file has no tile buffer, so a tree exactly on a tile edge is in both tiles. The tile whose
 * half-open square [0, extent) holds the point owns it (same rule as the job's count check).
 */
export function ownsPoint(feature: VectorTileFeature, extent: number): boolean {
  const p = feature.loadGeometry()[0]?.[0];
  return Boolean(p) && p!.x >= 0 && p!.x < extent && p!.y >= 0 && p!.y < extent;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Decode one tile; points outside `bounds` are left out, like the live bbox queries. */
export function decodeTreeTile(
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  bounds: BBox,
  into: Pick<PrebakedTrees, "vicmap" | "com" | "osm">,
): void {
  const vt = new VectorTile(new PbfReader(data));
  const inside = (lon: number, lat: number) =>
    lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
  const each = (name: string, fn: (lon: number, lat: number, props: Record<string, unknown>) => void) => {
    const layer = vt.layers[name];
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (!ownsPoint(feature, layer.extent)) continue;
      const geo = feature.toGeoJSON(x, y, z);
      if (geo.geometry.type !== "Point") continue;
      const [lon, lat] = geo.geometry.coordinates as [number, number];
      if (!inside(lon, lat)) continue;
      fn(lon, lat, feature.properties as Record<string, unknown>);
    }
  };
  each("vicmap", (lon, lat, p) => {
    const h2 = num(p.h2);
    if (h2 === null || h2 <= 0) return;
    const c2 = num(p.c2);
    into.vicmap.push({ lon, lat, height_m: h2 / 2, crown_m: c2 !== null && c2 > 0 ? c2 / 2 : null, dense: p.d === 1 });
  });
  each("com", (lon, lat, p) => {
    const dbh = num(p.dbh);
    into.com.push({
      lon,
      lat,
      dbh_cm: dbh !== null && dbh > 0 ? dbh : null,
      age: str(p.age),
      genus: str(p.g),
      scientific: str(p.sp),
    });
  });
  each("osm", (lon, lat, p) => {
    const sid = num(p.sid);
    if (sid === null) return;
    into.osm.push({ lon, lat, sid, tags: typeof p.tags === "string" ? p.tags : null });
  });
}

/** Trees for the cut from the pre-baked file, or the reason it could not be used. Never throws, except on abort. */
export async function loadPrebakedTrees(bounds: BBox, signal?: AbortSignal, deps: PrebakeDeps = {}): Promise<PrebakeResult> {
  const fetchManifest = deps.fetchManifest ?? defaultFetchManifest;
  try {
    const manifest = await fetchManifest(signal);
    if (!manifest?.bbox || typeof manifest.zoom !== "number") return { ok: false, reason: "the tree manifest is incomplete" };
    if (!bboxCovers(manifest.bbox, bounds)) return { ok: false, reason: "this cut is outside the pre-baked Greater Melbourne extent" };
    const archive = deps.archive ?? defaultArchive();
    const header = await archive.getHeader();
    const z = header.maxZoom;
    const trees: PrebakedTrees = { vicmap: [], com: [], osm: [], manifest, tiles: 0 };
    const tiles = tilesForBounds(bounds, z);
    const results = await Promise.all(tiles.map((t) => archive.getZxy(t.z, t.x, t.y, signal)));
    results.forEach((tile, i) => {
      if (!tile?.data) return;
      const t = tiles[i]!;
      decodeTreeTile(tile.data, t.z, t.x, t.y, bounds, trees);
    });
    trees.tiles = tiles.length;
    return { ok: true, trees };
  } catch (err) {
    if (signal?.aborted) throw err;
    const detail = err instanceof Error && err.message ? err.message : String(err);
    return { ok: false, reason: detail.replace(/\.$/, "") };
  }
}
