#!/usr/bin/env node
/**
 * Pre-bake Greater Melbourne trees into one PMTiles file for the app (live servers become backup).
 *
 *   node scripts/build-trees-pmtiles.mjs
 *
 * Sources: Vicmap Vegetation Tree Urban (ArcGIS, paged by OBJECTID as pbf), the City of Melbourne
 * Urban Forest export, and OSM tree points from the Overture base PMTiles the app already reads.
 * Writes public/trees.pmtiles and public/trees-manifest.json only after every check passes.
 *
 * Env: TIPPECANOE (binary), TREES_OUT_DIR (default public), TREES_ZOOM (14 or 15, default 14),
 * TREES_ALSO_ZOOM (build a second zoom into the work dir to compare sizes), TREES_PREV_MANIFEST
 * (last build's manifest; skip when every source stamp matches), TREES_FORCE=1, TREES_WORK_DIR,
 * TREES_CONCURRENCY (Vicmap pages in flight, default 3), TREES_VICMAP_FORMAT (pbf|geojson).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { OVERTURE_RELEASE_FALLBACK, releaseFromStacCatalog } from "../shared/overtureStacRelease.js";
import {
  checkArcgisJson,
  checkVicmapPage,
  comProps,
  COM_DATASET_URL,
  COM_SELECT,
  countCheck,
  decodeVicmapPbfResponse,
  fetchWithRetry,
  GREATER_MELBOURNE_BBOX as BBOX,
  inBbox,
  mapLimit,
  osmSizeTags,
  parseJsonBytes,
  shouldSkip,
  sizeCheck,
  sourceStamps,
  stableNumericId,
  tilesForBbox,
  TREES_ATTRIBUTION,
  TREES_MANIFEST_NAME,
  TREES_PMTILES_NAME,
  TREES_SCHEMA_VERSION,
  vicmapOidPages,
  vicmapOidPageUrl,
  vicmapProps,
  VICMAP_LAYER_URL,
} from "./trees-prebake-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, process.env.TREES_OUT_DIR ?? "public");
const WORK = resolve(process.env.TREES_WORK_DIR ?? join(ROOT, ".trees-work"));
const ZOOM = Number(process.env.TREES_ZOOM ?? 14);
const ALSO_ZOOM = process.env.TREES_ALSO_ZOOM ? Number(process.env.TREES_ALSO_ZOOM) : null;
const TIPPECANOE = process.env.TIPPECANOE ?? "tippecanoe";
const CONCURRENCY = Number(process.env.TREES_CONCURRENCY ?? 3);
const VICMAP_FORMAT = process.env.TREES_VICMAP_FORMAT === "geojson" ? "geojson" : "pbf";
const OVERTURE_BASE_ZOOM = 13;
/** TREES_SMOKE=1: a few pages and tiles only, count checks off. For trying the script, never for publishing. */
const SMOKE = process.env.TREES_SMOKE === "1";
const UA = { "User-Agent": "citycut-trees-prebake (https://github.com/kchaisor/citycut)" };

const t0 = Date.now();
const timings = {};
const log = (msg) => console.log(`[trees ${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);
function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
async function stage(name, fn) {
  const s = Date.now();
  const result = await fn();
  timings[name] = Math.round((Date.now() - s) / 100) / 10;
  log(`${name} done in ${timings[name]} s`);
  return result;
}
const json = (url, label) => fetchWithRetry(url, (b) => checkArcgisJson(parseJsonBytes(b)), { label, headers: UA });

async function resolveOvertureRelease() {
  const catalog = await fetchWithRetry("https://stac.overturemaps.org/catalog.json", parseJsonBytes, {
    label: "Overture STAC catalog",
    headers: UA,
  }).catch(() => null);
  return catalog ? releaseFromStacCatalog(catalog) : OVERTURE_RELEASE_FALLBACK;
}

async function readStamps() {
  const layer = await json(`${VICMAP_LAYER_URL}?f=json`, "Vicmap layer info");
  const count = await json(`${VICMAP_LAYER_URL}/query?where=1%3D1&returnCountOnly=true&f=json`, "Vicmap count");
  const maxRow = await json(
    `${VICMAP_LAYER_URL}/query?where=1%3D1&outFields=OBJECTID&returnGeometry=false&orderByFields=OBJECTID%20DESC&resultRecordCount=1&f=json`,
    "Vicmap max OBJECTID",
  );
  const com = await fetchWithRetry(COM_DATASET_URL, parseJsonBytes, { label: "CoM dataset info", headers: UA });
  const metas = com?.metas?.default ?? {};
  const overtureRelease = await resolveOvertureRelease();
  const edit = layer?.editingInfo?.dataLastEditDate;
  return {
    stamps: sourceStamps({
      vicmapDataLastEdit: typeof edit === "number" ? new Date(edit).toISOString() : null,
      vicmapCount: count.count ?? null,
      comDataProcessed: metas.data_processed ?? metas.modified ?? null,
      comCount: metas.records_count ?? null,
      overtureRelease,
      zoom: ZOOM,
    }),
    vicmapMaxOid: maxRow?.features?.[0]?.attributes?.OBJECTID ?? null,
    comModified: metas.modified ?? null,
  };
}

function writer(path) {
  const stream = createWriteStream(path);
  let n = 0;
  return {
    write(lon, lat, props) {
      n += 1;
      stream.write(`{"type":"Feature","geometry":{"type":"Point","coordinates":[${lon},${lat}]},"properties":${JSON.stringify(props)}}\n`);
    },
    close: () => new Promise((res, rej) => stream.end((err) => (err ? rej(err) : res(n)))),
    get count() {
      return n;
    },
  };
}

async function fetchVicmap(maxOid, expectedTotal) {
  const pages = SMOKE ? vicmapOidPages(maxOid).slice(500, 503) : vicmapOidPages(maxOid);
  const out = writer(join(WORK, "vicmap.jsonl"));
  let fetched = 0;
  let dropped = 0;
  let done = 0;
  const parse = (bytes, type) => {
    if (VICMAP_FORMAT === "pbf") return decodeVicmapPbfResponse(bytes, type);
    const body = checkArcgisJson(parseJsonBytes(bytes));
    return {
      exceededTransferLimit: Boolean(body.properties?.exceededTransferLimit || body.exceededTransferLimit),
      points: (body.features ?? []).map((f) => ({
        lon: f.geometry?.coordinates?.[0],
        lat: f.geometry?.coordinates?.[1],
        attributes: f.properties ?? {},
      })),
    };
  };
  await mapLimit(pages, CONCURRENCY, async ([lo, hi]) => {
    const page = checkVicmapPage(
      await fetchWithRetry(vicmapOidPageUrl(lo, hi, VICMAP_FORMAT), parse, {
        label: `Vicmap OBJECTID ${lo}..${hi - 1}`,
        headers: UA,
      }),
      lo,
      hi,
    );
    fetched += page.points.length;
    for (const point of page.points) {
      if (!inBbox(point.lon, point.lat)) continue;
      const props = vicmapProps(point);
      if (!props) {
        dropped += 1;
        continue;
      }
      out.write(point.lon.toFixed(7), point.lat.toFixed(7), props);
    }
    done += 1;
    if (done % 100 === 0 || done === pages.length) log(`Vicmap ${done}/${pages.length} pages, ${fetched} rows`);
  });
  const kept = await out.close();
  if (!SMOKE) countCheck("Vicmap rows fetched vs layer count", expectedTotal, fetched, 0);
  return { pages: pages.length, fetched, inBbox: kept, droppedInvalid: dropped };
}

async function fetchCom(expected) {
  const url = `${COM_DATASET_URL}/exports/json?select=${encodeURIComponent(COM_SELECT)}`;
  const rows = await fetchWithRetry(url, parseJsonBytes, { label: "CoM trees export", headers: UA, timeoutMs: 180_000 });
  if (!Array.isArray(rows)) throw new Error("CoM trees export was not a JSON array.");
  countCheck("CoM export rows vs dataset records_count", expected, rows.length, 0);
  const out = writer(join(WORK, "com.jsonl"));
  let dropped = 0;
  for (const row of rows) {
    const props = comProps(row);
    if (!props || !inBbox(row.longitude, row.latitude)) {
      dropped += 1;
      continue;
    }
    out.write(row.longitude, row.latitude, props);
  }
  return { fetched: rows.length, kept: await out.close(), dropped };
}

async function fetchOsm(release) {
  const archive = new PMTiles(`https://tiles.overturemaps.org/${release}/base.pmtiles`);
  const all = tilesForBbox(BBOX, OVERTURE_BASE_ZOOM);
  const tiles = SMOKE ? all.filter((t) => t.x >= 7394 && t.x <= 7395 && t.y >= 5026 && t.y <= 5027) : all;
  const seen = new Set();
  const out = writer(join(WORK, "osm.jsonl"));
  let bytes = 0;
  let done = 0;
  let rawPoints = 0;
  await mapLimit(tiles, 8, async ({ z, x, y }) => {
    let tile = null;
    for (let attempt = 1; attempt <= 3 && tile === null; attempt++) {
      try {
        tile = (await archive.getZxy(z, x, y)) ?? { data: null };
      } catch (err) {
        if (/\b(401|403|429)\b/.test(String(err))) throw err;
        if (attempt === 3) throw new Error(`Overture base tile ${z}/${x}/${y} failed: ${err}`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    done += 1;
    if (done % 200 === 0) log(`Overture base ${done}/${tiles.length} tiles`);
    if (!tile.data) return;
    bytes += tile.data.byteLength;
    const layer = new VectorTile(new PbfReader(tile.data)).layers.land;
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const props = feature.properties;
      if (String(props.class ?? "").toLowerCase() !== "tree") continue;
      const geo = feature.toGeoJSON(x, y, z);
      if (geo.geometry.type !== "Point") continue;
      rawPoints += 1;
      const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
      if (seen.has(id)) continue;
      seen.add(id);
      const [lon, lat] = geo.geometry.coordinates;
      if (!inBbox(lon, lat)) continue;
      const kept = { sid: stableNumericId(id) };
      const tags = osmSizeTags(props.source_tags);
      if (tags) kept.tags = tags;
      out.write(lon, lat, kept);
    }
  });
  return { tiles: tiles.length, tileBytes: bytes, rawPoints, unique: seen.size, kept: await out.close() };
}

function tippecanoe(outPath, zoom) {
  const detail = zoom >= 15 ? 13 : 14; // about 0.12 m either way
  const args = [
    "-q", "-f", "-o", outPath,
    "-Z", String(zoom), "-z", String(zoom), "-d", String(detail),
    "-b", "0", "-r1", "--no-feature-limit", "--no-tile-size-limit",
    "-n", "CityCut trees (Greater Melbourne)",
    "--attribution", TREES_ATTRIBUTION,
    "-L", `vicmap:${join(WORK, "vicmap.jsonl")}`,
    "-L", `com:${join(WORK, "com.jsonl")}`,
    "-L", `osm:${join(WORK, "osm.jsonl")}`,
  ];
  const run = spawnSync(TIPPECANOE, args, { stdio: "inherit" });
  if (run.status !== 0) throw new Error(`tippecanoe exited ${run.status ?? run.signal}`);
  return statSync(outPath).size;
}

/**
 * With no tile buffer a tree exactly on a tile edge is written to both tiles. The tile whose
 * half-open square [0, extent) holds it owns it; the app reader uses the same rule.
 */
function ownsPoint(feature, extent) {
  const p = feature.loadGeometry()[0]?.[0];
  return Boolean(p) && p.x >= 0 && p.x < extent && p.y >= 0 && p.y < extent;
}

/** Count every feature per layer in a local PMTiles file (no tile buffer, so each tree once). */
async function countTileFeatures(path) {
  const fd = openSync(path, "r");
  const source = {
    getKey: () => path,
    getBytes: async (offset, length) => {
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    },
  };
  const archive = new PMTiles(source);
  const header = await archive.getHeader();
  const counts = { vicmap: 0, com: 0, osm: 0 };
  const sizes = [];
  for (const { z, x, y } of tilesForBbox(BBOX, header.maxZoom)) {
    const tile = await archive.getZxy(z, x, y);
    if (!tile?.data) continue;
    sizes.push(tile.data.byteLength);
    const vt = new VectorTile(new PbfReader(tile.data));
    for (const name of Object.keys(counts)) {
      const layer = vt.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) if (ownsPoint(layer.feature(i), layer.extent)) counts[name] += 1;
    }
  }
  closeSync(fd);
  return { counts, tilesWithData: sizes.length, header };
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const { stamps, vicmapMaxOid, comModified } = await stage("stamps", readStamps);
  log(`source stamps ${JSON.stringify(stamps)}`);
  const prevPath = process.env.TREES_PREV_MANIFEST;
  const previous = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : null;
  const decision = shouldSkip(previous, stamps);
  if (decision.skip && process.env.TREES_FORCE !== "1") {
    log(`skip: ${decision.reason}`);
    output("skip", "true");
    return;
  }
  log(`rebuild: ${decision.reason}${process.env.TREES_FORCE === "1" ? " (forced)" : ""}`);
  output("skip", "false");
  if (!vicmapMaxOid || !stamps.vicmapCount) throw new Error("Vicmap layer count or max OBJECTID unknown.");

  const vicmap = await stage("vicmap", () => fetchVicmap(vicmapMaxOid, stamps.vicmapCount));
  const com = await stage("com", () => fetchCom(stamps.comCount));
  const osm = await stage("osm", () => fetchOsm(stamps.overtureRelease));
  if (!SMOKE && osm.kept < 1000) throw new Error(`OSM trees: only ${osm.kept} in Greater Melbourne; expected about 195,000.`);
  if (previous?.counts?.osm && Math.abs(osm.kept - previous.counts.osm) > previous.counts.osm * 0.2) {
    throw new Error(`OSM trees: ${osm.kept} vs ${previous.counts.osm} last build (more than 20% change).`);
  }

  const tmpTiles = join(WORK, `trees.z${ZOOM}.pmtiles`);
  const bytes = await stage("tippecanoe", () => tippecanoe(tmpTiles, ZOOM));
  const check = sizeCheck(bytes);
  if (check.level === "fail") {
    console.error(`::error::${check.message}`);
    throw new Error(check.message);
  }
  if (check.level === "warn") console.warn(`::warning::${check.message}`);
  else log(check.message);

  const verify = await stage("verify", () => countTileFeatures(tmpTiles));
  countCheck("vicmap features in tiles vs input", vicmap.inBbox, verify.counts.vicmap, 0);
  countCheck("com features in tiles vs input", com.kept, verify.counts.com, 0);
  countCheck("osm features in tiles vs input", osm.kept, verify.counts.osm, 0);

  let alsoZoom = null;
  if (ALSO_ZOOM && ALSO_ZOOM !== ZOOM) {
    const p = join(WORK, `trees.z${ALSO_ZOOM}.pmtiles`);
    const s = Date.now();
    alsoZoom = { zoom: ALSO_ZOOM, bytes: tippecanoe(p, ALSO_ZOOM), path: p, sec: (Date.now() - s) / 1000 };
    const v = await countTileFeatures(p);
    alsoZoom.tilesWithData = v.tilesWithData;
    log(`also built z${ALSO_ZOOM}: ${alsoZoom.bytes} bytes, ${v.tilesWithData} tiles`);
  }

  const sha = createHash("sha256").update(readFileSync(tmpTiles)).digest("hex");
  const manifest = {
    schema: TREES_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    bbox: BBOX,
    zoom: ZOOM,
    pmtilesBytes: bytes,
    pmtilesSha256: sha,
    tilesWithData: verify.tilesWithData,
    attribution: TREES_ATTRIBUTION,
    sourceStamps: stamps,
    sources: {
      vicmap: { url: VICMAP_LAYER_URL, dataLastEdit: stamps.vicmapDataLastEdit, layerCount: stamps.vicmapCount, format: VICMAP_FORMAT, ...vicmap },
      com: { url: COM_DATASET_URL, dataProcessed: stamps.comDataProcessed, modified: comModified, ...com },
      osm: { overtureRelease: stamps.overtureRelease, ...osm },
    },
    counts: verify.counts,
    rounding: "Vicmap height and crown diameter rounded to 0.5 m (h2, c2 = metres × 2). CoM and OSM fields verbatim.",
    alsoZoom: alsoZoom ? { zoom: alsoZoom.zoom, bytes: alsoZoom.bytes, tilesWithData: alsoZoom.tilesWithData, sec: alsoZoom.sec } : null,
    timingsSec: { ...timings, total: Math.round((Date.now() - t0) / 1000) },
  };
  // Publish both files only now, after every check passed: a failed run leaves nothing new behind.
  const finalTiles = join(OUT_DIR, TREES_PMTILES_NAME);
  const finalManifest = join(OUT_DIR, TREES_MANIFEST_NAME);
  renameSync(tmpTiles, finalTiles);
  writeFileSync(`${finalManifest}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(`${finalManifest}.tmp`, finalManifest);
  log(`wrote ${finalTiles} (${bytes} bytes) and ${finalManifest}`);
}

main().catch((err) => {
  console.error(`::error::Tree pre-bake failed: ${err instanceof Error ? err.message : err}`);
  for (const name of [TREES_PMTILES_NAME, TREES_MANIFEST_NAME]) rmSync(join(WORK, name), { force: true });
  process.exit(1);
});
