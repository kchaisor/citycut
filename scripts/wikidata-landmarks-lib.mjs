import { createHash } from "node:crypto";
import { WIKIDATA_ATTRIBUTION, WIKIDATA_SCHEMA_VERSION, WIKIDATA_SPARQL_URL } from "../shared/wikidataLandmarks.js";

export * from "../shared/wikidataLandmarks.js";
export const WIKIDATA_LANDMARKS_NAME = "wikidata-landmarks.json";
export const WIKIDATA_MANIFEST_NAME = "wikidata-landmarks-manifest.json";

export const GREATER_MELBOURNE_BBOX = { west: 144.333634, south: -38.502988, east: 145.878412, north: -37.175099 };

export function bboxCells(bbox, stepDeg) {
  if (!(stepDeg > 0)) throw new Error(`Cell size must be positive, got ${stepDeg}.`);
  const cols = Math.ceil((bbox.east - bbox.west) / stepDeg - 1e-9);
  const rows = Math.ceil((bbox.north - bbox.south) / stepDeg - 1e-9);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        west: bbox.west + c * stepDeg,
        south: bbox.south + r * stepDeg,
        east: Math.min(bbox.east, bbox.west + (c + 1) * stepDeg),
        north: Math.min(bbox.north, bbox.south + (r + 1) * stepDeg),
      });
    }
  }
  return cells;
}

export function landmarksDocument(items, { bbox, generatedAt }) {
  return {
    schemaVersion: WIKIDATA_SCHEMA_VERSION,
    generatedAt,
    bbox,
    attribution: WIKIDATA_ATTRIBUTION,
    items,
  };
}

export function landmarksManifest({ bbox, generatedAt, cellDeg, cells, queries, splits, rows, items, dropped, sha256, bytes }) {
  return {
    schemaVersion: WIKIDATA_SCHEMA_VERSION,
    file: WIKIDATA_LANDMARKS_NAME,
    source: WIKIDATA_SPARQL_URL,
    attribution: WIKIDATA_ATTRIBUTION,
    queryDate: generatedAt,
    bbox,
    cellDeg,
    cells,
    queries,
    splits,
    rows,
    itemCount: items.length,
    withHeight: items.filter((i) => i.heightsM.length > 0).length,
    withWikipedia: items.filter((i) => i.wikipedia).length,
    dropped,
    bytes,
    sha256,
  };
}

export function minimumItemsCheck(count, minimum) {
  if (count < minimum) {
    throw new Error(`Wikidata returned ${count} landmarks, fewer than the ${minimum} floor; not publishing.`);
  }
}

export function splitCell(cell) {
  const midLon = (cell.west + cell.east) / 2;
  const midLat = (cell.south + cell.north) / 2;
  return [
    { west: cell.west, south: cell.south, east: midLon, north: midLat },
    { west: midLon, south: cell.south, east: cell.east, north: midLat },
    { west: cell.west, south: midLat, east: midLon, north: cell.north },
    { west: midLon, south: midLat, east: cell.east, north: cell.north },
  ];
}

export function isSlowQueryFailure(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /HTTP 50[0234]\b|timed out/.test(message);
}

export async function queryCells(cells, fetchCell, { minCellDeg, onCell = () => {} }) {
  const queue = [...cells];
  const results = [];
  let splits = 0;
  while (queue.length > 0) {
    const cell = queue.shift();
    try {
      const rows = await fetchCell(cell);
      results.push(rows);
      onCell({ cell, rows, remaining: queue.length, splits });
    } catch (err) {
      const halfWidth = Math.max(cell.east - cell.west, cell.north - cell.south) / 2;
      if (!isSlowQueryFailure(err) || halfWidth < minCellDeg - 1e-9) throw err;
      splits += 1;
      queue.unshift(...splitCell(cell));
    }
  }
  return { results, splits };
}

export const WIKIDATA_RELEASE = "wikidata-landmarks-latest";

export function resolveWikidataDeploy({ body, manifestText }) {
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return { ok: false, message: "release manifest is not valid JSON" };
  }
  const sha = createHash("sha256").update(body).digest("hex");
  if (!manifest?.sha256 || manifest.sha256 !== sha) {
    return { ok: false, message: `SHA-256 mismatch (manifest ${manifest?.sha256 ?? "missing"}, file ${sha})` };
  }
  return { ok: true, bytes: body.length, itemCount: manifest.itemCount ?? null, queryDate: manifest.queryDate ?? "unknown" };
}
