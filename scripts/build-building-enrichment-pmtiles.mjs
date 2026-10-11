/**
 * Overture buildings (DuckDB GeoParquet for large bboxes), Python enrichment, tippecanoe → public/.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OVERTURE_RELEASE_FALLBACK, releaseFromStacCatalog } from "../shared/overtureStacRelease.js";

const DEFAULT_EXTENT = {
  west: 144.333634,
  south: -38.502988,
  east: 145.878412,
  north: -37.175099,
};
const REGION_NAME =
  process.env.BUILD_ENRICHMENT_REGION_NAME ??
  "Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL)";

function parseBbox() {
  const raw = process.env.BUILD_ENRICHMENT_BBOX;
  if (!raw) return DEFAULT_EXTENT;
  const [west, south, east, north] = raw.split(",").map(Number);
  return { west, south, east, north };
}

const BUILD_BBOX = parseBbox();
const CACHE = "pipeline/cache";
const OUT_PARQUET = "pipeline/out/overture-input.parquet";
const OUT_GEO = "pipeline/out/overture-input.geojson";
const ENRICHED = "pipeline/out/enrichment.geojson";
const PMTILES_OUT = "public/building-enrichment.pmtiles";
const MANIFEST = "public/building-enrichment-manifest.json";
// The app reads enrichment at z14 only (ENRICHMENT_TILE_ZOOM); lower zooms are never requested.
const MIN_ZOOM = Number(process.env.BUILD_ENRICHMENT_MIN_ZOOM ?? "14");
const MAX_ZOOM = Number(process.env.BUILD_ENRICHMENT_MAX_ZOOM ?? "14");

async function resolveOvertureRelease() {
  try {
    const response = await fetch("https://stac.overturemaps.org/catalog.json");
    if (!response.ok) throw new Error(String(response.status));
    const catalog = await response.json();
    return releaseFromStacCatalog(catalog);
  } catch {
    return OVERTURE_RELEASE_FALLBACK;
  }
}

function run(cmd, args, env = process.env) {
  const t0 = Date.now();
  const result = spawnSync(cmd, args, { stdio: "inherit", env });
  if (result.status !== 0) throw new Error(`${cmd} failed`);
  return (Date.now() - t0) / 1000;
}

async function main() {
  const stageSec = {};
  mkdirSync(CACHE, { recursive: true });
  mkdirSync("pipeline/out", { recursive: true });

  const release = await resolveOvertureRelease();
  console.log(`Overture release ${release}`);
  console.log(`Build bbox (${REGION_NAME}): ${JSON.stringify(BUILD_BBOX)}`);

  stageSec.overtureFetch = run("python3", [
    "pipeline/overture_fetch.py",
    "--release",
    release,
    "--parquet",
    OUT_PARQUET,
    "--parquet-only",
    "--bounds-json",
    JSON.stringify(BUILD_BBOX),
  ]);

  stageSec.pythonEnrichment = run("python3", [
    "pipeline/build_enrichment.py",
    "--input",
    OUT_PARQUET,
    "--output-geojson",
    ENRICHED,
    "--manifest",
    MANIFEST,
    "--extent-json",
    JSON.stringify(BUILD_BBOX),
  ]);

  console.log("[enrichment] LiDAR: no data, ELVIS not ordered");
  const tippecanoe = process.env.TIPPECANOE ?? "tippecanoe";
  stageSec.tippecanoe = run(tippecanoe, [
    "-o",
    PMTILES_OUT,
    "-l",
    "building_enrichment",
    `-Z${MIN_ZOOM}`,
    `-z${MAX_ZOOM}`,
    "--drop-densest-as-needed",
    "--extend-zooms-if-still-dropping",
    "--force",
    "--no-feature-limit",
    "--no-tile-size-limit",
    ENRICHED,
  ]);

  const bytes = statSync(PMTILES_OUT).size;
  const pmtilesSha256 = createHash("sha256").update(readFileSync(PMTILES_OUT)).digest("hex");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  manifest.pmtilesBytes = bytes;
  manifest.pmtilesSha256 = pmtilesSha256;
  manifest.overtureRelease = release;
  manifest.builtBbox = BUILD_BBOX;
  manifest.targetExtent = DEFAULT_EXTENT;
  manifest.regionName = REGION_NAME;
  manifest.tileZoomRange = { min: MIN_ZOOM, max: MAX_ZOOM };
  manifest.buildStageSec = stageSec;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`PMTiles ${PMTILES_OUT}: ${(bytes / 1024 / 1024).toFixed(2)} MiB (z${MIN_ZOOM}–z${MAX_ZOOM})`);
  console.log(`Stage seconds: ${JSON.stringify(stageSec)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
