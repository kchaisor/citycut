import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WIKIDATA_LANDMARKS_NAME, WIKIDATA_MANIFEST_NAME, WIKIDATA_SCHEMA_VERSION } from "../shared/wikidataLandmarks.js";

export const WIKIDATA_RELEASE = process.env.WIKIDATA_RELEASE?.trim() || "wikidata-landmarks-latest";

export function resolveWikidataDeploy({ tempDir, downloadOk, downloadError = "" }) {
  if (!downloadOk) return { ok: false, message: `release ${WIKIDATA_RELEASE} not downloaded (${downloadError.trim() || "unknown error"})` };
  const file = join(tempDir, WIKIDATA_LANDMARKS_NAME);
  const manifestPath = join(tempDir, WIKIDATA_MANIFEST_NAME);
  if (!existsSync(file) || !existsSync(manifestPath)) return { ok: false, message: "release assets incomplete" };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, message: "release manifest is not valid JSON" };
  }
  if (manifest.schemaVersion !== WIKIDATA_SCHEMA_VERSION) {
    return { ok: false, message: `schema version ${manifest.schemaVersion ?? "missing"}, expected ${WIKIDATA_SCHEMA_VERSION}` };
  }
  const bytes = readFileSync(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (!manifest.sha256 || manifest.sha256 !== sha) {
    return { ok: false, message: `SHA-256 mismatch (manifest ${manifest.sha256 ?? "missing"}, file ${sha})` };
  }
  return { ok: true, bytes: bytes.length, items: manifest.itemCount ?? null, queryDate: manifest.queryDate ?? "unknown" };
}
