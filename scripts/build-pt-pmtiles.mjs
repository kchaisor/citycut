/**
 * Downloads Transport Victoria PT GeoJSON, keeps greater Melbourne, writes PMTiles
 * to public/ for GitHub Pages. Run in CI before `vite build`.
 *
 * Licence: Creative Commons Attribution 4.0 (dataset page on opendata.transport.vic.gov.au).
 */
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const METRO = { west: 144.35, south: -38.25, east: 145.55, north: -37.45 };
const LINES_URL =
  "https://opendata.transport.vic.gov.au/dataset/6d36dfd9-8693-4552-8a03-05eb29a391fd/resource/aa99290b-0954-42ac-adb2-814c0e0de3f3/download/public_transport_lines.geojson";
const STOPS_URL =
  "https://opendata.transport.vic.gov.au/dataset/6d36dfd9-8693-4552-8a03-05eb29a391fd/resource/f14397c0-fb27-417c-95df-c606d4fe3095/download/public_transport_stops.geojson";

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

function filterGeojson(path, outPath, keepProps) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const features = (raw.features ?? [])
    .filter((feature) => {
      const box = featureBBox(feature);
      return box && bboxIntersects(box, METRO);
    })
    .map((feature) => ({
      type: "Feature",
      properties: keepProps(feature.properties ?? {}),
      geometry: {
        type: feature.geometry.type,
        coordinates: simplifyCoords(feature.geometry.coordinates),
      },
    }));
  writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features }));
  return features.length;
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
    "-zg",
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
  if (!process.env.SKIP_PT_DOWNLOAD) {
    console.log("Downloading PT lines…");
    await download(LINES_URL, linesCache);
    console.log("Downloading PT stops…");
    await download(STOPS_URL, stopsCache);
  }
  const metroLines = `${CACHE}/metro-lines.geojson`;
  const metroStops = `${CACHE}/metro-stops.geojson`;
  const lineCount = filterGeojson(linesCache, metroLines, (props) => ({
    MODE: props.MODE ?? props.mode ?? "",
  }));
  const stopCount = filterGeojson(stopsCache, metroStops, (props) => ({
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
