#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  CENSUS_FIELDS,
  CENSUS_TABLES,
  encodeRing,
  extractMetrics,
  groupShpRings,
  parseCsv,
  parseDbf,
  parseShpPolygons,
  simplifyRing,
} from "./census-people-lib.mjs";

const CACHE = path.resolve("tmp/census");
const OUT = path.resolve("public/census");
const STATE_CODE = "2";
const GCC_CODE = "2GMEL";
const TOLERANCE_DEG = 0.00003;
const DATAPACK = (level) =>
  `https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_${level}_for_VIC_short-header.zip`;
const SA1_BOUNDARIES =
  "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/SA1_2021_AUST_SHP_GDA2020.zip";

function download(url, name) {
  const file = path.join(CACHE, name);
  if (!fs.existsSync(file)) {
    console.log(`download ${url}`);
    execFileSync("curl", ["-sSfL", "--retry", "2", "-o", file, url], { stdio: "inherit" });
  }
  const dir = file.replace(/\.zip$/, "");
  if (!fs.existsSync(dir)) execFileSync("unzip", ["-oq", file, "-d", dir]);
  return dir;
}

function findFile(dir, pattern) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, pattern);
      if (hit) return hit;
    } else if (pattern.test(entry.name)) {
      return full;
    }
  }
  return null;
}

function loadLevel(dir, level) {
  const tables = {};
  for (const table of CENSUS_TABLES) {
    const file = findFile(dir, new RegExp(`^2021Census_${table}_VIC_${level}\\.csv$`));
    if (!file) throw new Error(`missing ${table} for ${level}`);
    tables[table] = parseCsv(fs.readFileSync(file, "utf8"));
  }
  const codes = [...tables.G01.keys()];
  const metrics = new Map();
  for (const code of codes) {
    const row = {};
    for (const table of CENSUS_TABLES) row[table] = tables[table].get(code);
    metrics.set(code, extractMetrics(row));
  }
  return metrics;
}

function bboxOf(polygons) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

const round = (n) => Math.round(n * 1e5) / 1e5;

function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const sa1Dir = download(DATAPACK("SA1"), "gcp-sa1-vic.zip");
  const sa2Dir = download(DATAPACK("SA2"), "gcp-sa2-vic.zip");
  const gccDir = download(DATAPACK("GCCSA"), "gcp-gccsa-vic.zip");
  const bndDir = download(SA1_BOUNDARIES, "sa1-2021-aust-shp.zip");

  const sa1Metrics = loadLevel(sa1Dir, "SA1");
  const sa2Metrics = loadLevel(sa2Dir, "SA2");
  const gccMetrics = loadLevel(gccDir, "GCCSA");
  const greater = gccMetrics.get(GCC_CODE);
  if (!greater) throw new Error("Greater Melbourne row missing");

  const dbf = parseDbf(fs.readFileSync(findFile(bndDir, /\.dbf$/)));
  const shapes = parseShpPolygons(fs.readFileSync(findFile(bndDir, /\.shp$/)));
  const chunks = new Map();
  for (let i = 0; i < dbf.length; i += 1) {
    const row = dbf[i];
    if (row.STE_CODE21 !== STATE_CODE || !shapes[i]) continue;
    const values = sa1Metrics.get(row.SA1_CODE21);
    if (!values) continue;
    const polygons = groupShpRings(shapes[i]).map((polygon) =>
      polygon.map((ring) => simplifyRing(ring, TOLERANCE_DEG)),
    );
    const chunk = chunks.get(row.SA2_CODE21) ?? {
      code: row.SA2_CODE21,
      name: row.SA2_NAME21,
      gcc: row.GCC_CODE21,
      sa1: [],
      bbox: [Infinity, Infinity, -Infinity, -Infinity],
    };
    const box = bboxOf(polygons);
    chunk.bbox = [
      Math.min(chunk.bbox[0], box[0]),
      Math.min(chunk.bbox[1], box[1]),
      Math.max(chunk.bbox[2], box[2]),
      Math.max(chunk.bbox[3], box[3]),
    ];
    chunk.sa1.push({
      code: row.SA1_CODE21,
      areaKm2: Number(Number(row.AREASQKM21).toFixed(4)),
      values,
      geometry: polygons.map((polygon) => polygon.map(encodeRing)),
    });
    chunks.set(row.SA2_CODE21, chunk);
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "sa2"), { recursive: true });
  let bytes = 0;
  const index = [];
  for (const chunk of [...chunks.values()].sort((a, b) => a.code.localeCompare(b.code))) {
    const sa2 = sa2Metrics.get(chunk.code) ?? null;
    const body = JSON.stringify({ code: chunk.code, name: chunk.name, sa2, sa1: chunk.sa1 });
    fs.writeFileSync(path.join(OUT, "sa2", `${chunk.code}.json`), body);
    bytes += body.length;
    index.push({ code: chunk.code, name: chunk.name, gcc: chunk.gcc, bbox: chunk.bbox.map(round) });
  }
  const indexBody = JSON.stringify({
    source: "ABS Census 2021 General Community Profile (SA1, SA2, GCCSA, Victoria) and ASGS Edition 3 SA1 2021 boundaries",
    licence: "CC BY 4.0",
    fields: CENSUS_FIELDS,
    coordScale: 1e5,
    greaterMelbourne: greater,
    sa2: index,
  });
  fs.writeFileSync(path.join(OUT, "index.json"), indexBody);
  console.log(
    `wrote ${index.length} SA2 chunks, ${[...chunks.values()].reduce((n, c) => n + c.sa1.length, 0)} SA1s, ${(bytes / 1e6).toFixed(2)} MB chunks, ${(indexBody.length / 1e3).toFixed(1)} kB index`,
  );
}

main();
