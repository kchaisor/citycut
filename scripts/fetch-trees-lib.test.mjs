import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTreesDeploy } from "./fetch-trees-lib.mjs";

function dir(tiles, manifest) {
  const d = mkdtempSync(join(tmpdir(), "trees-deploy-"));
  if (tiles !== null) writeFileSync(join(d, "trees.pmtiles"), tiles);
  if (manifest !== null) writeFileSync(join(d, "trees-manifest.json"), manifest);
  return d;
}

describe("Pages install of the trees release", () => {
  const tiles = Buffer.from("PMTiles-fake");
  const sha = createHash("sha256").update(tiles).digest("hex");
  it("installs a verified release", () => {
    const d = dir(tiles, JSON.stringify({ pmtilesSha256: sha, generatedAt: "2026-10-12" }));
    expect(resolveTreesDeploy({ tempDir: d, downloadOk: true })).toMatchObject({ ok: true, bytes: tiles.length });
  });
  it("refuses a hash mismatch, a missing file, or a failed download", () => {
    expect(resolveTreesDeploy({ tempDir: dir(tiles, JSON.stringify({ pmtilesSha256: "0" })), downloadOk: true }).ok).toBe(false);
    expect(resolveTreesDeploy({ tempDir: dir(null, "{}"), downloadOk: true }).message).toBe("release assets incomplete");
    expect(resolveTreesDeploy({ tempDir: dir(null, null), downloadOk: false, downloadError: "release not found" }).message).toMatch(
      /not downloaded \(release not found\)/,
    );
  });
});
