/**
 * Ensure public/building-enrichment.pmtiles exists before production build.
 * Prefers a committed copy; otherwise downloads from manifest.pmtilesUrl or GitHub Releases.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OUT = "public/building-enrichment.pmtiles";
const MANIFEST = "public/building-enrichment-manifest.json";

if (existsSync(OUT)) {
  console.log(`Using committed ${OUT}`);
  process.exit(0);
}

let manifest = null;
if (existsSync(MANIFEST)) {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
}

const url = process.env.ENRICHMENT_PMTILES_URL ?? manifest?.pmtilesUrl;
if (url) {
  console.log(`Downloading enrichment PMTiles from ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PMTiles download HTTP ${response.status}`);
  mkdirSync("public", { recursive: true });
  const buf = Buffer.from(await response.arrayBuffer());
  writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT} (${(buf.length / 1024 / 1024).toFixed(2)} MiB)`);
  process.exit(0);
}

const gh = spawnSync(
  "gh",
  ["release", "download", "building-enrichment-latest", "-p", "building-enrichment.pmtiles", "-D", "public"],
  { encoding: "utf8" },
);
if (gh.status === 0 && existsSync(OUT)) {
  console.log(`Downloaded ${OUT} from GitHub release building-enrichment-latest`);
  process.exit(0);
}

console.warn(
  "No building-enrichment.pmtiles in tree and no download URL; build continues without offline enrichment file.",
);
