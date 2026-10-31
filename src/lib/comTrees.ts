import { toLocal } from "./geo";
import { ageFactor, logDroppedTreeValues, treeSize, type ComMeasure } from "./trees";
import type { LonLat, TreeFeat } from "../types";
import {
  errorText,
  fetchTreePage,
  readTreePageWithRetry,
  TREE_PAGE_RETRY_MS,
  TREE_PAGE_TIMEOUT_MS,
  TreeSourceHttpError,
  type TreeSourceResult,
} from "./treeSourceFetch";

const ENDPOINT =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/trees-with-species-and-dimensions-urban-forest/records";

const PAGE = 100;
const MAX_RECORDS = 4000;

const CITY = { south: -37.86, west: 144.89, north: -37.77, east: 145 };

export type ComTree = ComMeasure & {
  lat: number;
  lon: number;
  genus: string | null;
  scientific: string | null;
};

type BBox = { south: number; west: number; north: number; east: number };

type ApiRow = {
  latitude?: number;
  longitude?: number;
  diameter_breast_height?: number | null;
  age_description?: string | null;
  genus?: string | null;
  scientific_name?: string | null;
};

function intersectsCity(bounds: BBox): boolean {
  return !(
    bounds.north < CITY.south ||
    bounds.south > CITY.north ||
    bounds.east < CITY.west ||
    bounds.west > CITY.east
  );
}

function parseRow(row: ApiRow): ComTree | null {
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  const dbh = row.diameter_breast_height;
  return {
    lat: row.latitude as number,
    lon: row.longitude as number,
    dbh_cm: typeof dbh === "number" && dbh > 0 ? dbh : null,
    age: row.age_description?.trim() || null,
    genus: row.genus?.trim() || null,
    scientific: row.scientific_name?.trim() || null,
  };
}

async function readPage(
  where: string,
  offset: number,
  signal?: AbortSignal,
  timeoutMs = TREE_PAGE_TIMEOUT_MS,
): Promise<{ total: number; rows: ComTree[]; dropped: number }> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("limit", String(PAGE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("where", where);
  url.searchParams.set("order_by", "com_id");
  url.searchParams.set(
    "select",
    "latitude,longitude,diameter_breast_height,age_description,genus,scientific_name",
  );
  const response = await fetchTreePage(
    url,
    { headers: { Accept: "application/json" } },
    "City of Melbourne tree records",
    signal,
    timeoutMs,
  );
  if (!response.ok) {
    throw new TreeSourceHttpError(`City of Melbourne tree records answered ${response.status}.`, response.status);
  }
  const json = (await response.json()) as { total_count?: number; results?: ApiRow[] };
  let dropped = 0;
  const rows: ComTree[] = [];
  for (const row of json.results ?? []) {
    const dbh = row.diameter_breast_height;
    if (typeof dbh === "number" && !(dbh > 0)) dropped += 1;
    const parsed = parseRow(row);
    if (!parsed) dropped += 1;
    else rows.push(parsed);
  }
  return { total: json.total_count ?? rows.length, rows, dropped };
}

export async function fetchComTreesDetailed(
  bounds: BBox,
  signal?: AbortSignal,
  pageTimeoutMs = TREE_PAGE_TIMEOUT_MS,
  retryMs = TREE_PAGE_RETRY_MS,
): Promise<TreeSourceResult<ComTree>> {
  if (!intersectsCity(bounds)) return { rows: [], error: null, partial: false };
  const where = `latitude>=${bounds.south.toFixed(6)} AND latitude<=${bounds.north.toFixed(6)} AND longitude>=${bounds.west.toFixed(6)} AND longitude<=${bounds.east.toFixed(6)}`;
  const page = (offset: number) =>
    readTreePageWithRetry(() => readPage(where, offset, signal, pageTimeoutMs), signal, retryMs);
  let first: Awaited<ReturnType<typeof readPage>>;
  try {
    first = await page(0);
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      rows: [],
      error: `City of Melbourne tree records could not be loaded, so that tier is missing. ${errorText(err, "")}`.trim(),
      partial: false,
    };
  }
  const rows = first.rows.slice();
  let dropped = first.dropped;
  const total = Math.min(first.total, MAX_RECORDS);
  const offsets: number[] = [];
  for (let offset = PAGE; offset < total; offset += PAGE) offsets.push(offset);
  const concurrency = 4;
  let error: string | null = null;
  for (let i = 0; i < offsets.length && error === null; i += concurrency) {
    const batch = await Promise.allSettled(
      offsets.slice(i, i + concurrency).map((offset) => page(offset)),
    );
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    for (const settled of batch) {
      if (settled.status === "rejected") {
        error ??= errorText(settled.reason, "a page failed");
        continue;
      }
      if (error !== null) continue;
      rows.push(...settled.value.rows);
      dropped += settled.value.dropped;
    }
  }
  logDroppedTreeValues(dropped, "City of Melbourne");
  return {
    rows,
    error:
      error === null
        ? null
        : `City of Melbourne tree records are incomplete: ${rows.length} of ${total} loaded, then ${error}`,
    partial: error !== null,
  };
}

export async function fetchComTrees(bounds: BBox, signal?: AbortSignal): Promise<ComTree[]> {
  const result = await fetchComTreesDetailed(bounds, signal);
  if (result.error && !result.partial) throw new Error(result.error);
  return result.rows;
}

export function comRecordsToTrees(
  records: ComTree[],
  origin: LonLat,
  sideM: number,
  frameShape: import("./siteFrame").SiteFrameShape = "square",
): TreeFeat[] {
  const half = sideM / 2;
  const trees: TreeFeat[] = [];
  records.forEach((record, index) => {
    if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon)) return;
    const at = toLocal(record.lat, record.lon, origin);
    const margin = 0.2;
    if (frameShape === "square") {
      if (Math.abs(at[0]) > half + margin || Math.abs(at[1]) > half + margin) return;
    } else if (at[0] * at[0] + at[1] * at[1] > (half + margin) ** 2) return;
    const genus = record.genus ?? undefined;
    const species = record.scientific ?? undefined;
    const sized = treeSize(
      {
        ...(genus ? { genus } : {}),
        ...(species ? { species } : {}),
      },
      { dbh_cm: record.dbh_cm, age: record.age },
    );
    trees.push({
      id: index + 1,
      at,
      ...sized,
      tier: "com",
      ...(genus ? { genus } : {}),
      ...(species ? { species } : {}),
    });
  });
  return trees;
}

function genusOf(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().split(/[\s_]+/).filter(Boolean)[0] ?? "";
}

function sameGenus(tree: TreeFeat, record: ComTree): boolean {
  const treeGenus = genusOf(tree.genus) || genusOf(tree.species) || genusOf(tree.taxon);
  if (!treeGenus) return false;
  const recordGenus = genusOf(record.genus) || genusOf(record.scientific);
  return treeGenus === recordGenus;
}

function useful(record: ComTree): boolean {
  return (record.dbh_cm !== null && record.dbh_cm > 0) || ageFactor(record.age) !== null;
}

type Located = ComTree & { at: [number, number] };

export function applyComTreeSizes(trees: TreeFeat[], records: ComTree[], origin: LonLat): TreeFeat[] {
  if (trees.length === 0 || records.length === 0) return trees;
  const cell = 16;
  const located: Located[] = records.filter(useful).map((record) => ({
    ...record,
    at: toLocal(record.lat, record.lon, origin),
  }));
  const buckets = new Map<string, number[]>();
  located.forEach((record, index) => {
    const key = `${Math.floor(record.at[0] / cell)}:${Math.floor(record.at[1] / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  });

  const pairs: { treeIndex: number; recordIndex: number; distance: number }[] = [];
  trees.forEach((tree, treeIndex) => {
    if (tree.sizeSource === "osm") return;
    const cx = Math.floor(tree.at[0] / cell);
    const cy = Math.floor(tree.at[1] / cell);
    const indexes: number[] = [];
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const bucket = buckets.get(`${x}:${y}`);
        if (bucket) indexes.push(...bucket);
      }
    }
    const around = indexes.map((recordIndex) => {
      const record = located[recordIndex];
      return {
        recordIndex,
        distance: Math.hypot(record.at[0] - tree.at[0], record.at[1] - tree.at[1]),
        genus: sameGenus(tree, record),
      };
    });
    const named = around.filter((item) => item.genus && item.distance <= 12);
    const pool = named.length > 0 ? named : around.filter((item) => item.distance <= 8);
    for (const item of pool) pairs.push({ treeIndex, recordIndex: item.recordIndex, distance: item.distance });
  });
  pairs.sort((a, b) => a.distance - b.distance);

  const usedTrees = new Set<number>();
  const usedRecords = new Set<number>();
  const next = trees.slice();
  for (const pair of pairs) {
    if (usedTrees.has(pair.treeIndex) || usedRecords.has(pair.recordIndex)) continue;
    const tree = next[pair.treeIndex];
    const record = located[pair.recordIndex];
    let genus = tree.genus;
    let species = tree.species;
    if ((record.scientific || record.genus) && !genus && !species) {
      genus = record.genus ?? undefined;
      species = record.scientific ?? undefined;
    }
    const sized = treeSize(
      {
        ...(genus ? { genus } : {}),
        ...(species ? { species } : {}),
        ...(tree.taxon ? { taxon: tree.taxon } : {}),
        ...(tree.leafType ? { leaf_type: tree.leafType } : {}),
        ...(tree.leafCycle ? { leaf_cycle: tree.leafCycle } : {}),
      },
      { dbh_cm: record.dbh_cm, age: record.age },
    );
    if (sized.sizeSource !== "com") continue;
    usedTrees.add(pair.treeIndex);
    usedRecords.add(pair.recordIndex);
    next[pair.treeIndex] = {
      ...tree,
      ...sized,
      ...(genus ? { genus } : {}),
      ...(species ? { species } : {}),
    };
  }
  return next;
}
