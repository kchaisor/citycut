/**
 * Pure decision logic for Pages deploy enrichment asset resolution.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RELEASE =
  process.env.BUILDING_ENRICHMENT_RELEASE?.trim() || "building-enrichment-latest";
export const PMTILES_NAME = "building-enrichment.pmtiles";
export const MANIFEST_NAME = "building-enrichment-manifest.json";

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

/**
 * @returns {"release_ok" | "sha_mismatch" | "release_not_found" | "no_token" | "download_failed" | "committed_fallback"}
 */
export function resolveEnrichmentDeploy(input) {
  const publicDir = input.publicDir;
  const committedTiles = join(publicDir, PMTILES_NAME);
  const committedManifest = join(publicDir, MANIFEST_NAME);
  const hasCommitted = existsSync(committedTiles);

  if (!input.ghToken) {
    if (hasCommitted) {
      return { outcome: "committed_fallback", message: "no GH_TOKEN, using committed tiles" };
    }
    return { outcome: "no_token", message: "no GH_TOKEN and no committed fallback" };
  }

  if (!input.releaseDownloadOk) {
    const msg = input.releaseMissing
      ? "release not found, using committed tiles"
      : "release download failed, using committed tiles";
    if (hasCommitted) {
      return { outcome: "committed_fallback", message: msg };
    }
    return { outcome: "release_not_found", message: msg };
  }

  const tempTiles = join(input.tempDir, PMTILES_NAME);
  const tempManifest = join(input.tempDir, MANIFEST_NAME);
  if (!existsSync(tempTiles) || !existsSync(tempManifest)) {
    if (hasCommitted) {
      return { outcome: "committed_fallback", message: "release assets incomplete, using committed tiles" };
    }
    return { outcome: "download_failed", message: "release assets incomplete" };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(tempManifest, "utf8"));
  } catch {
    if (hasCommitted) {
      return { outcome: "committed_fallback", message: "invalid release manifest, using committed tiles" };
    }
    return { outcome: "download_failed", message: "invalid release manifest" };
  }

  const expected = manifest.pmtilesSha256;
  if (!expected || typeof expected !== "string") {
    if (hasCommitted) {
      return { outcome: "committed_fallback", message: "release manifest missing pmtilesSha256, using committed tiles" };
    }
    return { outcome: "sha_mismatch", message: "release manifest missing pmtilesSha256" };
  }

  const actual = sha256File(tempTiles);
  if (actual !== expected) {
    if (hasCommitted) {
      return {
        outcome: "committed_fallback",
        message: `release SHA-256 mismatch (manifest ${expected}, file ${actual}), using committed tiles`,
      };
    }
    return { outcome: "sha_mismatch", message: `SHA-256 mismatch (manifest ${expected}, file ${actual})` };
  }

  return { outcome: "release_ok", message: "release verified", tempTiles, tempManifest, manifest };
}

export function installVerifiedRelease(publicDir, tempDir, result) {
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(join(tempDir, PMTILES_NAME), join(publicDir, PMTILES_NAME));
  copyFileSync(join(tempDir, MANIFEST_NAME), join(publicDir, MANIFEST_NAME));
}
