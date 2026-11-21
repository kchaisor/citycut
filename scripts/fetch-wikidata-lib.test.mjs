import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WIKIDATA_LANDMARKS_NAME, WIKIDATA_MANIFEST_NAME, WIKIDATA_SCHEMA_VERSION } from "../shared/wikidataLandmarks.js";
import { resolveWikidataDeploy } from "./fetch-wikidata-lib.mjs";

const dirs = [];
function release(body, manifest) {
  const dir = mkdtempSync(join(tmpdir(), "wd-test-"));
  dirs.push(dir);
  if (body != null) writeFileSync(join(dir, WIKIDATA_LANDMARKS_NAME), body);
  if (manifest != null) writeFileSync(join(dir, WIKIDATA_MANIFEST_NAME), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  return dir;
}
const sha = (s) => createHash("sha256").update(s).digest("hex");

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Wikidata release install for Pages", () => {
  const body = JSON.stringify({ schemaVersion: WIKIDATA_SCHEMA_VERSION, items: [] });

  it("installs a release whose file matches the manifest hash", () => {
    const dir = release(body, { schemaVersion: WIKIDATA_SCHEMA_VERSION, sha256: sha(body), itemCount: 3659, queryDate: "2026-11-20" });
    expect(resolveWikidataDeploy({ tempDir: dir, downloadOk: true })).toEqual({ ok: true, bytes: body.length, items: 3659, queryDate: "2026-11-20" });
  });

  it("refuses a failed download, missing assets, bad JSON, another schema or a hash mismatch", () => {
    expect(resolveWikidataDeploy({ tempDir: release(body, null), downloadOk: false, downloadError: "404" }).ok).toBe(false);
    expect(resolveWikidataDeploy({ tempDir: release(body, null), downloadOk: true }).message).toBe("release assets incomplete");
    expect(resolveWikidataDeploy({ tempDir: release(body, "{"), downloadOk: true }).message).toBe("release manifest is not valid JSON");
    expect(resolveWikidataDeploy({ tempDir: release(body, { schemaVersion: 99, sha256: sha(body) }), downloadOk: true }).message).toMatch(/schema version 99/);
    expect(resolveWikidataDeploy({ tempDir: release(body, { schemaVersion: WIKIDATA_SCHEMA_VERSION, sha256: "x" }), downloadOk: true }).message).toMatch(/SHA-256 mismatch/);
  });
});
