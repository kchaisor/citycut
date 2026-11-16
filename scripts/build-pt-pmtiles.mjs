/**
 * Downloads Transport Victoria PT GeoJSON, keeps greater Melbourne, writes PMTiles
 * to public/ for GitHub Pages. Run in CI before `vite build`.
 *
 * Licence: Creative Commons Attribution 4.0 (dataset page on opendata.transport.vic.gov.au).
 */
import { createReadStream, createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { lookupPtResources, probeUrl, ptCandidates, useFirstWorking } from "./pt-data-lib.mjs";

export const METRO = { west: 144.35, south: -38.25, east: 145.55, north: -37.45 };
const CACHE = "tmp/pt-cache";
const OUT = "public";

function bboxIntersects(a, b) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function featureBBox(feature) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (coord) => {
    if (!Array.isArray(coord)) return;
    if (typeof coord[0] === "number" && typeof coord[1] === "number") {
      west = Math.min(west, coord[0]);
      east = Math.max(east, coord[0]);
      south = Math.min(south, coord[1]);
      north = Math.max(north, coord[1]);
      return;
    }
    for (const child of coord) visit(child);
  };
  visit(feature.geometry?.coordinates);
  if (!Number.isFinite(west)) return null;
  return { west, south, east, north };
}

function simplifyCoords(coords, precision = 5) {
  const round = (n) => Math.round(n * 10 ** precision) / 10 ** precision;
  const walk = (c) => {
    if (typeof c[0] === "number") return [round(c[0]), round(c[1])];
    return c.map(walk);
  };
  return walk(coords);
}

async function download(url, dest) {
  mkdirSync(CACHE, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${url}: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

async function resolveCandidates() {
  const { found, error } = await lookupPtResources();
  if (error) console.warn(`PT dataset lookup: ${error}. Falling back to known-good resource ids where needed.`);
  return ptCandidates(found);
}

export async function filterGeojson(path, outPath, keepProps) {
  let count = 0;
  await pipeline(
    createReadStream(path),
    pick.withParserAsStream({ filter: "features" }),
    streamArray.asStream(),
    async function* (source) {
      yield '{"type":"FeatureCollection","features":[';
      for await (const { value: feature } of source) {
        const box = featureBBox(feature);
        if (!box || !bboxIntersects(box, METRO)) continue;
        const kept = {
          type: "Feature",
          properties: keepProps(feature.properties ?? {}),
          geometry: {
            type: feature.geometry.type,
            coordinates: simplifyCoords(feature.geometry.coordinates),
          },
        };
        yield (count === 0 ? "" : ",") + JSON.stringify(kept);
        count += 1;
      }
      yield "]}";
    },
    createWriteStream(outPath),
  );
  return count;
}

function runTippecanoe(input, output, layerName, extraArgs = []) {
  const tippecanoe = process.env.TIPPECANOE || "tippecanoe";
  const args = [
    "-o",
    output,
    "-l",
    layerName,
    "--force",
    "--no-tile-compression",
    "-z12",
    "-Z12",
    "--drop-densest-as-needed",
    ...extraArgs,
    input,
  ];
  const result = spawnSync(tippecanoe, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`tippecanoe failed for ${output}`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const linesCache = `${CACHE}/lines.geojson`;
  const stopsCache = `${CACHE}/stops.geojson`;
  if (process.argv.includes("--resolve-only")) {
    const candidates = await resolveCandidates();
    for (const kind of ["lines", "stops"]) {
      const used = await useFirstWorking(kind, candidates[kind], (url) => probeUrl(url));
      console.log(`PT ${kind}: range check HTTP ${used.result}`);
    }
    return;
  }
  if (!process.env.SKIP_PT_DOWNLOAD) {
    const candidates = await resolveCandidates();
    console.log("Downloading PT lines…");
    await useFirstWorking("lines", candidates.lines, (url) => download(url, linesCache));
    console.log("Downloading PT stops…");
    await useFirstWorking("stops", candidates.stops, (url) => download(url, stopsCache));
  }
  const metroLines = `${CACHE}/metro-lines.geojson`;
  const metroStops = `${CACHE}/metro-stops.geojson`;
  const lineCount = await filterGeojson(linesCache, metroLines, (props) => ({
    MODE: props.MODE ?? props.mode ?? "",
  }));
  const stopCount = await filterGeojson(stopsCache, metroStops, (props) => ({
    MODE: props.MODE ?? props.mode ?? "",
  }));
  console.log(`Metro filter: ${lineCount} lines, ${stopCount} stops`);
  const linesPmtiles = `${OUT}/pt-metro-lines.pmtiles`;
  const stopsPmtiles = `${OUT}/pt-metro-stops.pmtiles`;
  runTippecanoe(metroLines, linesPmtiles, "lines");
  runTippecanoe(metroStops, stopsPmtiles, "stops", ["-r1"]);
  const statLines = readFileSync(linesPmtiles).byteLength;
  const statStops = readFileSync(stopsPmtiles).byteLength;
  writeFileSync(
    `${OUT}/pt-metro-manifest.json`,
    JSON.stringify(
      {
        metroBounds: METRO,
        lineFeatures: lineCount,
        stopFeatures: stopCount,
        ptMetroLinesBytes: statLines,
        ptMetroStopsBytes: statStops,
        licence: "Creative Commons Attribution 4.0",
        source: "https://opendata.transport.vic.gov.au/dataset/public-transport-lines-and-stops",
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${linesPmtiles} (${statLines} bytes) and ${stopsPmtiles} (${statStops} bytes)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
