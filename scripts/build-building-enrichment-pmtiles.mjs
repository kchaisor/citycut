/**
 * Dump Overture building props for metro, run Python enrichment, tippecanoe → public/.
 */
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";

const DEFAULT_METRO = { west: 144.35, south: -38.25, east: 145.55, north: -37.45 };
function parseBbox() {
  const raw = process.env.BUILD_ENRICHMENT_BBOX;
  if (!raw) return DEFAULT_METRO;
  const [west, south, east, north] = raw.split(",").map(Number);
  return { west, south, east, north };
}
const METRO = parseBbox();
const CACHE = "pipeline/cache";
const OUT_GEO = "pipeline/out/overture-input.geojson";
const ENRICHED = "pipeline/out/enrichment.geojson";
const PMTILES_OUT = "public/building-enrichment.pmtiles";
const MANIFEST = "public/building-enrichment-manifest.json";
const Z = 14;

const OVERTURE_RELEASE_FALLBACK = "2026-09-23.1";

async function resolveOvertureRelease() {
  try {
    const response = await fetch("https://stac.overturemaps.org/catalog.json");
    if (!response.ok) throw new Error(String(response.status));
    const catalog = await response.json();
    const latest = catalog.links?.find((link) => link.rel === "latest");
    const href = latest?.href;
    if (!href) throw new Error("missing latest");
    const release = href.split("/").filter(Boolean).pop();
    if (!release) throw new Error("bad latest href");
    return release;
  } catch {
    return OVERTURE_RELEASE_FALLBACK;
  }
}

function tileRange(bounds, z) {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat) => (lat * Math.PI) / 180;
  const yFor = (lat) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

async function dumpOvertureInput(release) {
  const url = `https://tiles.overturemaps.org/${release}/buildings.pmtiles`;
  const pmtiles = new PMTiles(url);
  const tiles = tileRange(METRO, Z);
  const features = [];
  for (const { z, x, y } of tiles) {
    const got = await pmtiles.getZxy(z, x, y);
    if (!got?.data) continue;
    const vt = new VectorTile(new PbfReader(got.data));
    const layer = vt.layers.building;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geo = feature.toGeoJSON(x, y, z);
      if (geo.geometry.type !== "Polygon" && geo.geometry.type !== "MultiPolygon") continue;
      const props = feature.properties ?? {};
      const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
      if (!id) continue;
      features.push({
        type: "Feature",
        properties: {
          overture_id: id,
          id,
          class: props.class,
          subtype: props.subtype,
          use: props.use,
          height: props.height,
          num_floors: props.num_floors,
        },
        geometry: geo.geometry,
      });
    }
  }
  mkdirSync(CACHE, { recursive: true });
  mkdirSync("pipeline/out", { recursive: true });
  writeFileSync(OUT_GEO, JSON.stringify({ type: "FeatureCollection", features }));
  return features.length;
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${cmd} failed`);
}

async function main() {
  const release = await resolveOvertureRelease();
  console.log(`Overture release ${release}`);
  const count = await dumpOvertureInput(release);
  console.log(`Dumped ${count} building fragments to ${OUT_GEO}`);
  run("python3", ["pipeline/build_enrichment.py", "--input", OUT_GEO, "--output-geojson", ENRICHED, "--manifest", MANIFEST]);
  const tippecanoe = process.env.TIPPECANOE ?? "tippecanoe";
  run(tippecanoe, [
    "-o",
    PMTILES_OUT,
    "-l",
    "building_enrichment",
    "-Z14",
    "-z14",
    "--drop-densest-as-needed",
    "--extend-zooms-if-still-dropping",
    "--force",
    "--no-feature-limit",
    "--no-tile-size-limit",
    ENRICHED,
  ]);
  const bytes = statSync(PMTILES_OUT).size;
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  manifest.pmtilesBytes = bytes;
  manifest.overtureRelease = release;
  manifest.builtBbox = METRO;
  manifest.targetExtent = DEFAULT_METRO;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`PMTiles ${PMTILES_OUT}: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
