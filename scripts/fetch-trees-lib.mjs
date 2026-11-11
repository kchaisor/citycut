import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TREES_MANIFEST_NAME, TREES_PMTILES_NAME } from "./trees-prebake-lib.mjs";

export const TREES_RELEASE = process.env.TREES_RELEASE?.trim() || "trees-latest";

export function resolveTreesDeploy({ tempDir, downloadOk, downloadError = "" }) {
  if (!downloadOk) return { ok: false, message: `release ${TREES_RELEASE} not downloaded (${downloadError.trim() || "unknown error"})` };
  const tiles = join(tempDir, TREES_PMTILES_NAME);
  const manifestPath = join(tempDir, TREES_MANIFEST_NAME);
  if (!existsSync(tiles) || !existsSync(manifestPath)) return { ok: false, message: "release assets incomplete" };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, message: "release manifest is not valid JSON" };
  }
  const bytes = readFileSync(tiles);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (!manifest.pmtilesSha256 || manifest.pmtilesSha256 !== sha) {
    return { ok: false, message: `SHA-256 mismatch (manifest ${manifest.pmtilesSha256 ?? "missing"}, file ${sha})` };
  }
  return { ok: true, bytes: bytes.length, generatedAt: manifest.generatedAt ?? "unknown" };
}
