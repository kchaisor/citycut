#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetchWithRetry, parseJsonBytes } from "./trees-prebake-lib.mjs";
import {
  bboxCells,
  checkSparqlJson,
  finaliseItems,
  GREATER_MELBOURNE_BBOX,
  groupBindings,
  landmarkQueryUrl,
  landmarksDocument,
  landmarksManifest,
  minimumItemsCheck,
  WIKIDATA_LANDMARKS_NAME,
  WIKIDATA_MANIFEST_NAME,
} from "./wikidata-landmarks-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, process.env.WIKIDATA_OUT_DIR ?? "public");
const CELL_DEG = Number(process.env.WIKIDATA_CELL_DEG ?? 0.2);
const MIN_ITEMS = Number(process.env.WIKIDATA_MIN_ITEMS ?? 100);
const PAUSE_MS = Number(process.env.WIKIDATA_PAUSE_MS ?? 1000);
const UA = {
  "User-Agent": "citycut-wikidata-prebake (https://github.com/kchaisor/citycut)",
  Accept: "application/sparql-results+json",
};

const t0 = Date.now();
const log = (msg) => console.log(`[wikidata ${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);

function writeAtomic(path, text) {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

async function main() {
  const bbox = GREATER_MELBOURNE_BBOX;
  const cells = bboxCells(bbox, CELL_DEG);
  const generatedAt = new Date().toISOString();
  const grouped = new Map();
  let rows = 0;
  for (const [i, cell] of cells.entries()) {
    const bindings = await fetchWithRetry(landmarkQueryUrl(cell), (b) => checkSparqlJson(parseJsonBytes(b)), {
      label: `Wikidata cell ${i + 1}/${cells.length}`,
      headers: UA,
      timeoutMs: 90_000,
      backoffMs: [10_000, 30_000],
    });
    rows += bindings.length;
    groupBindings(bindings, grouped);
    log(`cell ${i + 1}/${cells.length}: ${bindings.length} rows, ${grouped.size} items so far`);
    if (PAUSE_MS > 0 && i < cells.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  const { items, dropped } = finaliseItems(grouped, bbox);
  log(`kept ${items.length} items; dropped ${dropped.noEnglishLabel} without an English label, ${dropped.noCoordinateInBbox} without a coordinate in the box`);
  minimumItemsCheck(items.length, MIN_ITEMS);

  mkdirSync(OUT_DIR, { recursive: true });
  const body = `${JSON.stringify(landmarksDocument(items, { bbox, generatedAt }))}\n`;
  const sha256 = createHash("sha256").update(body).digest("hex");
  writeAtomic(join(OUT_DIR, WIKIDATA_LANDMARKS_NAME), body);
  const manifest = landmarksManifest({
    bbox,
    generatedAt,
    cellDeg: CELL_DEG,
    cells: cells.length,
    rows,
    items,
    dropped,
    sha256,
    bytes: Buffer.byteLength(body),
  });
  writeAtomic(join(OUT_DIR, WIKIDATA_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  log(`wrote ${WIKIDATA_LANDMARKS_NAME} (${manifest.bytes} bytes) and ${WIKIDATA_MANIFEST_NAME}`);
}

main().catch((err) => {
  console.error(`[wikidata] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
