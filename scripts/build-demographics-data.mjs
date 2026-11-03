import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const METRO = { west: 144.35, south: -38.25, east: 145.55, north: -37.45 };
const GCCSA = "2GMEL";
const SA1_QUERY =
  "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA1/MapServer/0/query";
const GCP_ZIP =
  "https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SA1_for_VIC_short-header.zip";
const CACHE = "tmp/demographics";
const OUT = "public";

const AGE_BANDS = ["0-14", "15-24", "25-34", "35-49", "50-64", "65+"];
const HH_TYPES = ["lone", "couple", "family", "group"];

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readCsv(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = Object.fromEntries(header.map((key, index) => [key, cols[index] ?? ""]));
    const code = row.SA1_CODE_2021 ?? row.sa1_code_2021;
    if (code) rows.set(String(code), row);
  }
  return rows;
}

function num(row, key) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function sumKeys(row, keys) {
  return keys.reduce((total, key) => total + num(row, key), 0);
}

function ageFromG01(row) {
  const mid4554 = num(row, "Age_45_54_yr_P") * 0.5;
  return {
    "0-14": sumKeys(row, ["Age_0_4_yr_P", "Age_5_14_yr_P"]),
    "15-24": sumKeys(row, ["Age_15_19_yr_P", "Age_20_24_yr_P"]),
    "25-34": num(row, "Age_25_34_yr_P"),
    "35-49": num(row, "Age_35_44_yr_P") + mid4554,
    "50-64": num(row, "Age_55_64_yr_P") + mid4554,
    "65+": sumKeys(row, ["Age_65_74_yr_P", "Age_75_84_yr_P", "Age_85ov_P"]),
  };
}

function householdsFromG42(row) {
  return {
    lone: num(row, "SH_Lone_P_H"),
    couple: num(row, "SH_FHs_CF_no_C"),
    family: num(row, "SH_FHs_CF_C") + num(row, "SH_FHs_OnePF"),
    group: num(row, "SH_Group_H"),
  };
}

async function download(url, dest) {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(dest)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${url}: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

function simplifyRing(ring, maxPoints = 24) {
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const out = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  if (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]) {
    out.push(out[0]);
  }
  return out;
}

async function arcgisQuery(params) {
  const response = await fetch(`${SA1_QUERY}?${params}`);
  if (!response.ok) throw new Error(`ArcGIS query failed: ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(json.error.message ?? "ArcGIS error");
  return json;
}

async function listMelbourneSa1Codes() {
  const codes = [];
  let offset = 0;
  const pageSize = 2000;
  for (;;) {
    const params = new URLSearchParams({
      where: `gccsa_code_2021='${GCCSA}'`,
      outFields: "sa1_code_2021",
      returnGeometry: "false",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const json = await arcgisQuery(params);
    for (const feature of json.features ?? []) {
      const code = String(feature.attributes?.sa1_code_2021 ?? "");
      if (code) codes.push(code);
    }
    if ((json.features?.length ?? 0) < pageSize) break;
    offset += pageSize;
  }
  return codes;
}

async function fetchSa1Geometries(codes) {
  const units = new Map();
  const batchSize = 8;
  for (let index = 0; index < codes.length; index += batchSize) {
    const batch = codes.slice(index, index + batchSize);
    const where = batch.map((code) => `sa1_code_2021='${code}'`).join(" OR ");
    const params = new URLSearchParams({
      where,
      outFields: "sa1_code_2021,area_albers_sqkm",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });
    const ingest = (json) => {
      for (const feature of json.features ?? []) {
      const code = String(feature.attributes?.sa1_code_2021 ?? "");
      const rings = feature.geometry?.rings?.[0];
      if (!code || !rings?.length) continue;
      const ring = simplifyRing(
        rings.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]),
      );
        units.set(code, {
          code,
          areaKm2: Number(feature.attributes?.area_albers_sqkm) || 0,
          ring,
        });
      }
    };
    let json;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          json = await arcgisQuery(params);
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
      ingest(json);
    } catch {
      for (const code of batch) {
        const single = new URLSearchParams({
          where: `sa1_code_2021='${code}'`,
          outFields: "sa1_code_2021,area_albers_sqkm",
          returnGeometry: "true",
          outSR: "4326",
          f: "json",
        });
        json = await arcgisQuery(single);
        ingest(json);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
    if (index > 0 && index % 400 === 0) {
      console.log(JSON.stringify({ geometryProgress: index, of: codes.length }));
    }
  }
  return units;
}

function ensureGcpCsvs(zipPath) {
  const extractDir = `${CACHE}/gcp-vic`;
  mkdirSync(extractDir, { recursive: true });
  const g01 = `${extractDir}/2021Census_G01_VIC_SA1.csv`;
  const g42 = `${extractDir}/2021Census_G42_VIC_SA1.csv`;
  if (!existsSync(g01) || !existsSync(g42)) {
    const list = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
    if (list.status !== 0) throw new Error("Could not list GCP zip");
    for (const name of ["2021Census_G01_VIC_SA1.csv", "2021Census_G42_VIC_SA1.csv"]) {
      const line = list.stdout.split("\n").find((row) => row.includes(name));
      if (!line) throw new Error(`Missing ${name} in GCP zip`);
      const member = line.replace(/^\s*\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+/, "").trim();
      const out = spawnSync("unzip", ["-p", zipPath, member], { encoding: "utf8", maxBuffer: 1024 * 1024 * 256 });
      if (out.status !== 0) throw new Error(`Extract failed for ${name}`);
      writeFileSync(`${extractDir}/${name}`, out.stdout);
    }
  }
  return { g01, g42 };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const zipPath = `${CACHE}/vic-gcp.zip`;
  await download(GCP_ZIP, zipPath);
  const { g01, g42 } = ensureGcpCsvs(zipPath);
  const popRows = readCsv(g01);
  const hhRows = readCsv(g42);

  const melbourneCodes = await listMelbourneSa1Codes();
  const geometries = await fetchSa1Geometries(melbourneCodes);
  const benchmark = {
    population: 0,
    age: Object.fromEntries(AGE_BANDS.map((band) => [band, 0])),
    households: Object.fromEntries(HH_TYPES.map((kind) => [kind, 0])),
  };
  const units = [];

  for (const code of melbourneCodes) {
    const geom = geometries.get(code);
    const popRow = popRows.get(code);
    const hhRow = hhRows.get(code);
    if (!geom || !popRow || !hhRow) continue;
    const population = num(popRow, "Tot_P_P");
    if (population <= 0) continue;
    const age = ageFromG01(popRow);
    const households = householdsFromG42(hhRow);
    benchmark.population += population;
    for (const band of AGE_BANDS) benchmark.age[band] += age[band];
    for (const kind of HH_TYPES) benchmark.households[kind] += households[kind];
    units.push({
      code,
      areaKm2: geom.areaKm2,
      ring: geom.ring,
      population,
      age,
      households,
    });
  }

  const dataset = {
    version: 1,
    gccsa: GCCSA,
    licence: "CC BY 4.0",
    source: "ABS Census 2021 General Community Profile (SA1)",
    bbox: METRO,
    benchmark,
    units,
  };

  writeFileSync(`${OUT}/demographics-metro.json`, JSON.stringify(dataset));
  writeFileSync(
    `${OUT}/demographics-manifest.json`,
    JSON.stringify({
      version: 1,
      dataUrl: "demographics-metro.json",
      gccsa: GCCSA,
      bbox: METRO,
      unitCount: units.length,
      builtAt: new Date().toISOString(),
      source: dataset.source,
      licence: dataset.licence,
    }),
  );
  console.log(
    JSON.stringify({
      units: units.length,
      population: benchmark.population,
      bytes: readFileSync(`${OUT}/demographics-metro.json`).length,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
