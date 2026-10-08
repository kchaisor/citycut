/**
 * Rebuild committed City of Melbourne fallback tiles in public/.
 * Same pipeline as GM; bbox matches manifest builtBbox (144.89–145°E, −37.86–−37.77°S).
 */
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  BUILD_ENRICHMENT_BBOX: "144.89,-37.86,145,-37.77",
  BUILD_ENRICHMENT_MIN_ZOOM: process.env.BUILD_ENRICHMENT_MIN_ZOOM ?? "11",
  BUILD_ENRICHMENT_MAX_ZOOM: process.env.BUILD_ENRICHMENT_MAX_ZOOM ?? "14",
  BUILD_ENRICHMENT_REGION_NAME: "City of Melbourne (committed fallback tiles)",
};

const result = spawnSync("node", ["scripts/build-building-enrichment-pmtiles.mjs"], {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);
