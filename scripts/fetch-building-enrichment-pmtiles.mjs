/**
 * Ensure public/building-enrichment.pmtiles + manifest match the latest release before build.
 * Falls back to committed copies when the release download or hash check fails.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OUT = "public/building-enrichment.pmtiles";
const MANIFEST = "public/building-enrichment-manifest.json";
const RELEASE = "building-enrichment-latest";

function sha256File(path) {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

function downloadReleaseAssets() {
  mkdirSync("public", { recursive: true });
  const gh = spawnSync(
    "gh",
    [
      "release",
      "download",
      RELEASE,
      "-p",
      "building-enrichment.pmtiles",
      "-p",
      "building-enrichment-manifest.json",
      "-D",
      "public",
    ],
    { encoding: "utf8" },
  );
  if (gh.status !== 0) {
    console.warn(`[enrichment] release download failed: ${gh.stderr || gh.stdout}`);
    return false;
  }
  if (!existsSync(OUT) || !existsSync(MANIFEST)) {
    console.warn("[enrichment] release download missing expected assets");
    return false;
  }
  return true;
}

function verifyManifestHash() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const expected = manifest.pmtilesSha256;
  if (!expected || typeof expected !== "string") {
    console.warn("[enrichment] manifest missing pmtilesSha256");
    return false;
  }
  const actual = sha256File(OUT);
  if (actual !== expected) {
    console.warn(`[enrichment] PMTiles SHA-256 mismatch (manifest ${expected}, file ${actual})`);
    return false;
  }
  console.log(`Verified ${OUT} against manifest (${(manifest.pmtilesBytes / 1024 / 1024).toFixed(2)} MiB)`);
  return true;
}

function useCommittedFallback() {
  if (!existsSync(OUT)) {
    console.warn("No committed building-enrichment.pmtiles fallback; build continues without offline enrichment file.");
    return false;
  }
  console.warn(`Using committed fallback ${OUT}`);
  if (existsSync(MANIFEST)) {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const expected = manifest.pmtilesSha256;
    if (expected) {
      const actual = sha256File(OUT);
      if (actual !== expected) {
        console.warn(
          `[enrichment] committed PMTiles hash mismatch (manifest ${expected}, file ${actual}); serving file anyway`,
        );
      } else {
        console.log(`Committed fallback matches manifest hash`);
      }
    }
  }
  return true;
}

if (downloadReleaseAssets() && verifyManifestHash()) {
  process.exit(0);
}

console.warn("[enrichment] Release assets unavailable or failed verification; trying committed fallback.");
if (!useCommittedFallback()) {
  process.exit(0);
}
