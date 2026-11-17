import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateEpwAllSeasons,
  areWindSeasonsSane,
  chooseLongestUsableRecord,
  compactSeasonRecord,
  isFullRecordTmyxZip,
  orderTmyxCandidates,
  parseEpwWindRows,
  stationIdFromZipName,
  WIND_ROSE_SOURCE,
  WIND_SPEED_BIN_EDGES_MS,
} from "./wind-rose-build-lib.mjs";

const INDEX_URL =
  "https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/AUS_Australia/index.html";
const BASE_URL =
  "https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/AUS_Australia/";
const OUT_PATH = "public/wind/australia-tmyx.json";
const DOC_PATH = "scripts/README-wind-roses.md";
const WIND_ROSE_ASSET_VERSION = 2;

function parseArgs(argv) {
  const limit = Number(argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? "0");
  const onlyVic = argv.includes("--vic");
  const dry = argv.includes("--dry");
  return { limit: Number.isFinite(limit) ? limit : 0, onlyVic, dry };
}

function listStationCandidates(html) {
  const byId = new Map();
  for (const match of html.matchAll(/href="([^"]+_TMYx[^"]*\.zip)"/gi)) {
    const rel = match[1].replace(/&nbsp;/g, " ");
    const base = rel.split("/").pop() ?? rel;
    const id = stationIdFromZipName(base);
    const arr = byId.get(id) ?? [];
    arr.push(rel);
    byId.set(id, arr);
  }
  const stations = [];
  for (const names of byId.values()) {
    const candidates = orderTmyxCandidates(names);
    if (candidates.length) stations.push(candidates);
  }
  stations.sort((a, b) => a[0].localeCompare(b[0]));
  return stations;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function epwFromZip(zipBuf) {
  const dir = mkdtempSync(join(tmpdir(), "citycut-epw-"));
  try {
    writeFileSync(join(dir, "pack.zip"), zipBuf);
    execFileSync("unzip", ["-q", "pack.zip", "*.epw"], { cwd: dir });
    const epwName = readdirSync(dir).find((n) => n.toLowerCase().endsWith(".epw"));
    if (!epwName) throw new Error("missing epw in zip");
    return readFileSync(join(dir, epwName), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function readCandidate(relPath) {
  const zipName = relPath.split("/").pop() ?? relPath;
  const url = relPath.startsWith("http") ? relPath : `${BASE_URL}${relPath}`;
  const zipBuf = await fetchBuffer(url);
  const text = epwFromZip(zipBuf);
  const { location, period, rows } = parseEpwWindRows(text);
  if (!location || rows.length < 100) return null;
  const seasons = aggregateEpwAllSeasons(rows);
  return {
    zipName,
    location,
    seasons,
    years: period?.years ?? null,
    periodStart: period?.periodStart ?? "TMYx",
    periodEnd: period?.periodEnd ?? "TMYx",
    sane: areWindSeasonsSane(seasons),
  };
}

async function processStation(candidatePaths, failed) {
  const read = [];
  for (const relPath of candidatePaths) {
    try {
      const candidate = await readCandidate(relPath);
      if (candidate) read.push(candidate);
      if (candidate?.sane && isFullRecordTmyxZip(candidate.zipName)) break;
    } catch (e) {
      failed.push(`${relPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const chosen = chooseLongestUsableRecord(read);
  if (!chosen) return null;
  const station = {
    id: stationIdFromZipName(chosen.zipName),
    name: chosen.location.name,
    lat: chosen.location.lat,
    lon: chosen.location.lon,
    heightM: chosen.location.heightM,
    periodStart: chosen.periodStart,
    periodEnd: chosen.periodEnd,
    sourceZip: chosen.zipName,
    seasons: Object.fromEntries(
      Object.entries(chosen.seasons).map(([season, record]) => [season, compactSeasonRecord(record)]),
    ),
  };
  return chosen.years === null ? station : { ...station, years: chosen.years };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const { limit, onlyVic, dry } = parseArgs(process.argv.slice(2));
  const html = await fetch(INDEX_URL).then((r) => r.text());
  let zips = listStationCandidates(html);
  if (onlyVic) zips = zips.filter((names) => names[0].includes("AUS_VIC_"));
  if (limit > 0) zips = zips.slice(0, limit);
  console.log(`TMYx stations to build: ${zips.length}`);
  if (dry) return;

  const stations = [];
  const failed = [];
  await mapPool(zips, 6, async (candidatePaths) => {
    const station = await processStation(candidatePaths, failed);
    if (station) {
      stations.push(station);
      if (stations.length % 25 === 0) console.log(`built ${stations.length}/${zips.length}`);
    }
  });

  stations.sort((a, b) => a.id.localeCompare(b.id));
  const asset = {
    version: WIND_ROSE_ASSET_VERSION,
    speedBinEdgesMs: [...WIND_SPEED_BIN_EDGES_MS],
    source: WIND_ROSE_SOURCE,
    stations,
  };
  mkdirSync("public/wind", { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(asset));
  writeFileSync(
    DOC_PATH,
    `# Wind rose asset\n\nGenerated by \`npm run build:wind\`.\n\n- Script: \`scripts/build-wind-roses.mjs\` (shared binning in \`scripts/wind-rose-build-lib.mjs\`, mirrored in \`src/lib/windRoseEpw.ts\`).\n- Source: hourly wind from ${WIND_ROSE_SOURCE}\n- Record: each station uses its longest TMYx file (by \`#years\` in the EPW header) whose winter and annual calm pass the app's station sanity caps, trying the full-record \`_TMYx.zip\` first and the dated 15-year windows only when that is missing, unreadable or fails the caps.\n- Stations: ${stations.length}\n- Failed: ${failed.length}\n- Output: \`${OUT_PATH}\`\n`,
  );
  for (const line of failed) console.warn(line);
  console.log(JSON.stringify({ out: OUT_PATH, stations: stations.length, failed: failed.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});