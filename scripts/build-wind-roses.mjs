import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateEpwAllSeasons,
  areWindSeasonsSane,
  chooseLongestUsableRecord,
  compactSeasonRecord,
  isFullRecordTmyxZip,
  isUsableRecord,
  mostRecentDatedRecord,
  orderTmyxCandidates,
  parseEpwWindRows,
  stationIdFromZipName,
  WIND_ROSE_SOURCE,
  WIND_SPEED_BIN_EDGES_MS,
} from "./wind-rose-build-lib.mjs";
import { WIND_AFTERNOON_HOURS, WIND_DAYPART_CARD_NOTE, WIND_MORNING_HOURS } from "../src/lib/windDayparts.ts";

const INDEX_URL =
  "https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/AUS_Australia/index.html";
const BASE_URL =
  "https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/AUS_Australia/";
const OUT_INDEX_PATH = "public/wind/australia-tmyx.json";
const OUT_STATIONS_DIR = "public/wind/stations";
const DOC_PATH = "scripts/README-wind-roses.md";
const WIND_ROSE_ASSET_VERSION = 3;
const CACHE_DIR = process.env.CITYCUT_EPW_CACHE || "/tmp/citycut-epw-cache";

export class FatalSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "FatalSourceError";
  }
}

function parseArgs(argv) {
  const limit = Number(argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? "0");
  const onlyId = argv.find((a) => a.startsWith("--station="))?.slice("--station=".length) ?? "";
  const outDir = argv.find((a) => a.startsWith("--out-dir="))?.slice("--out-dir=".length) ?? "";
  const onlyVic = argv.includes("--vic");
  const dry = argv.includes("--dry");
  return { limit: Number.isFinite(limit) ? limit : 0, onlyId, outDir, onlyVic, dry };
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

function cachePathFor(url) {
  const name = url.split("/").pop() ?? "download";
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return join(CACHE_DIR, safe);
}

function looksBlocked(status, contentType, preview) {
  if (status === 403 || status === 429) return true;
  const type = contentType.toLowerCase();
  const body = preview.toLowerCase();
  if (type.includes("text/html") || body.includes("<html") || body.includes("<!doctype")) {
    return /captcha|access denied|cf-challenge|attention required|too many requests|just a moment/.test(body);
  }
  return /captcha/.test(body);
}

async function fetchBuffer(url) {
  const cached = cachePathFor(url);
  if (existsSync(cached)) return readFileSync(cached);
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  const preview = buf.toString("utf8").slice(0, 2000);
  const trimmed = preview.trimStart().toLowerCase();
  const htmlBody = trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || contentType.toLowerCase().includes("text/html");
  if (!res.ok || looksBlocked(res.status, contentType, preview) || htmlBody) {
    throw new FatalSourceError(
      `Stopped downloading weather files: HTTP ${res.status} from ${url} (${contentType || "no type"}).`,
    );
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cached, buf);
  return buf;
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
  const recentDated = candidatePaths.find((p) => !isFullRecordTmyxZip(p));
  const read = [];
  const readPath = async (relPath) => {
    try {
      const candidate = await readCandidate(relPath);
      if (candidate) read.push(candidate);
      return candidate;
    } catch (e) {
      if (e instanceof FatalSourceError) throw e;
      failed.push(`${relPath}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };
  if (recentDated) await readPath(recentDated);
  for (const relPath of candidatePaths) {
    if (relPath === recentDated) continue;
    const candidate = await readPath(relPath);
    if (candidate && isFullRecordTmyxZip(candidate.zipName) && isUsableRecord(candidate, mostRecentDatedRecord(read))) break;
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

function indexRecord(station) {
  return {
    id: station.id,
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    heightM: station.heightM,
    periodStart: station.periodStart,
    periodEnd: station.periodEnd,
    sourceZip: station.sourceZip,
    annualCalmPct: station.seasons.annual.calmPct,
    winterCalmPct: station.seasons.winter.calmPct,
    ...(station.years == null ? {} : { years: station.years }),
  };
}

function writeReadme(stationCount, failedCount) {
  writeFileSync(
    DOC_PATH,
    `# Wind rose asset

Generated by \`npm run build:wind\`.

- Script: \`scripts/build-wind-roses.mjs\` (shared binning in \`scripts/wind-rose-build-lib.mjs\`, mirrored in \`src/lib/windRoseEpw.ts\`).
- Source: hourly wind from ${WIND_ROSE_SOURCE}
- Record: each station uses its longest TMYx file (by \`#years\` in the EPW header) whose winter and annual calm pass the app's station sanity caps and whose calm share, over the year and in every season, is no more than 5 points above the station's most recent dated file (when that file itself passes the caps). Longer records with more calm than that are usually old 3-hourly observations whose gaps read as calm. The full-record \`_TMYx.zip\` is tried first and the dated 15-year windows only when it is missing, unreadable or fails these checks.
- Time of day: each season is stored as All day, Morning (6am–12pm, EPW hours 7–12) and Afternoon (12pm–6pm, EPW hours 13–18) in the station's local standard time (no daylight saving). ${WIND_DAYPART_CARD_NOTE}.
- Stations: ${stationCount}
- Failed: ${failedCount}
- Output: slim index \`${OUT_INDEX_PATH}\` plus one file per station in \`${OUT_STATIONS_DIR}/\`. The app loads the index, then only the chosen station.
`,
  );
}

async function main() {
  const { limit, onlyId, outDir, onlyVic, dry } = parseArgs(process.argv.slice(2));
  const indexPath = outDir ? join(outDir, "australia-tmyx.json") : OUT_INDEX_PATH;
  const stationsDir = outDir ? join(outDir, "stations") : OUT_STATIONS_DIR;
  const html = await fetch(INDEX_URL).then(async (r) => {
    const text = await r.text();
    if (looksBlocked(r.status, r.headers.get("content-type") ?? "", text) || !r.ok) {
      throw new FatalSourceError(`Stopped downloading weather files: HTTP ${r.status} from ${INDEX_URL}.`);
    }
    return text;
  });
  let zips = listStationCandidates(html);
  if (onlyVic) zips = zips.filter((names) => names[0].includes("AUS_VIC_"));
  if (onlyId) zips = zips.filter((names) => stationIdFromZipName(names[0]) === onlyId);
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
  const staging = mkdtempSync(join(tmpdir(), "citycut-wind-asset-"));
  try {
    const stationDir = join(staging, "stations");
    mkdirSync(stationDir, { recursive: true });
    for (const station of stations) {
      writeFileSync(join(stationDir, `${station.id}.json`), JSON.stringify(station));
    }
    const index = {
      version: WIND_ROSE_ASSET_VERSION,
      speedBinEdgesMs: [...WIND_SPEED_BIN_EDGES_MS],
      source: WIND_ROSE_SOURCE,
      dayparts: {
        all: { label: "All day", hours: null },
        morning: { label: "Morning", window: "6am–12pm", hours: [...WIND_MORNING_HOURS] },
        afternoon: { label: "Afternoon", window: "12pm–6pm", hours: [...WIND_AFTERNOON_HOURS] },
      },
      stations: stations.map(indexRecord),
    };
    writeFileSync(join(staging, "australia-tmyx.json"), JSON.stringify(index));

    mkdirSync(outDir || "public/wind", { recursive: true });
    if (existsSync(stationsDir)) rmSync(stationsDir, { recursive: true, force: true });
    mkdirSync(stationsDir, { recursive: true });
    for (const name of readdirSync(stationDir)) {
      writeFileSync(join(stationsDir, name), readFileSync(join(stationDir, name)));
    }
    writeFileSync(indexPath, readFileSync(join(staging, "australia-tmyx.json")));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  if (!outDir) writeReadme(stations.length, failed.length);
  for (const line of failed) console.warn(line);
  console.log(JSON.stringify({ out: indexPath, stationsDir, stations: stations.length, failed: failed.length }));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
