import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_NAME,
  PMTILES_NAME,
  resolveEnrichmentDeploy,
  sha256Buffer,
} from "./fetch-building-enrichment-lib.mjs";

describe("resolveEnrichmentDeploy", () => {
  it("accepts verified release in temp dir", () => {
    const publicDir = mkdtempSync(join(tmpdir(), "cc-public-"));
    const tempDir = mkdtempSync(join(tmpdir(), "cc-temp-"));
    const tiles = Buffer.from("verified-tiles");
    writeFileSync(join(tempDir, PMTILES_NAME), tiles);
    writeFileSync(
      join(tempDir, MANIFEST_NAME),
      JSON.stringify({ pmtilesSha256: sha256Buffer(tiles), pmtilesBytes: tiles.length }),
    );
    const result = resolveEnrichmentDeploy({
      publicDir,
      tempDir,
      ghToken: "token",
      releaseDownloadOk: true,
      releaseMissing: false,
    });
    expect(result.outcome).toBe("release_ok");
  });

  it("falls back on sha mismatch without touching committed pair", () => {
    const publicDir = mkdtempSync(join(tmpdir(), "cc-public-"));
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, PMTILES_NAME), Buffer.from("committed"));
    writeFileSync(join(publicDir, MANIFEST_NAME), Buffer.from("{}"));
    const tempDir = mkdtempSync(join(tmpdir(), "cc-temp-"));
    writeFileSync(join(tempDir, PMTILES_NAME), Buffer.from("bad"));
    writeFileSync(
      join(tempDir, MANIFEST_NAME),
      JSON.stringify({ pmtilesSha256: sha256Buffer(Buffer.from("expected")) }),
    );
    const result = resolveEnrichmentDeploy({
      publicDir,
      tempDir,
      ghToken: "token",
      releaseDownloadOk: true,
      releaseMissing: false,
    });
    expect(result.outcome).toBe("committed_fallback");
    expect(result.message).toMatch(/SHA-256 mismatch/);
  });

  it("uses committed fallback when release not found", () => {
    const publicDir = mkdtempSync(join(tmpdir(), "cc-public-"));
    writeFileSync(join(publicDir, PMTILES_NAME), Buffer.from("committed"));
    const result = resolveEnrichmentDeploy({
      publicDir,
      tempDir: mkdtempSync(join(tmpdir(), "cc-temp-")),
      ghToken: "token",
      releaseDownloadOk: false,
      releaseMissing: true,
    });
    expect(result.outcome).toBe("committed_fallback");
    expect(result.message).toMatch(/release not found/);
  });

  it("reports no_token when no committed fallback", () => {
    const publicDir = mkdtempSync(join(tmpdir(), "cc-public-"));
    const result = resolveEnrichmentDeploy({
      publicDir,
      tempDir: mkdtempSync(join(tmpdir(), "cc-temp-")),
      ghToken: "",
      releaseDownloadOk: false,
      releaseMissing: false,
    });
    expect(result.outcome).toBe("no_token");
  });
});
