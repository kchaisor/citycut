import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureFullBuildingEnrichment,
  ensurePrebakedTrees,
  fetchPrebakedPmtiles,
  hasFullBuildingEnrichment,
  hasPrebakedTrees,
} from "./fetch-prebaked-pmtiles.mjs";

const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

describe("fetch-prebaked-pmtiles", () => {
  const dirs = [];
  function tempPublicDir() {
    const d = mkdtempSync(join(tmpdir(), "cc-prebake-test-"));
    dirs.push(d);
    return d;
  }
  afterEach(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop(), { recursive: true, force: true });
    }
  });

  it("recognizes existing prebaked trees and full enrichment archives (idempotent skip)", async () => {
    const publicDir = tempPublicDir();
    writeFileSync(join(publicDir, "trees.pmtiles"), Buffer.alloc(1_500_000, 1));
    writeFileSync(join(publicDir, "trees-manifest.json"), JSON.stringify({ schemaVersion: 1 }));
    writeFileSync(join(publicDir, "building-enrichment.pmtiles"), Buffer.alloc(21_000_000, 2));
    writeFileSync(
      join(publicDir, "building-enrichment-manifest.json"),
      JSON.stringify({ regionName: "Greater Melbourne (ABS GCCSA 2GMEL)" }),
    );

    expect(hasPrebakedTrees(publicDir)).toBe(true);
    expect(hasFullBuildingEnrichment(publicDir)).toBe(true);

    let fetchCalls = 0;
    const res = await fetchPrebakedPmtiles({
      publicDir,
      fetchImpl: async () => {
        fetchCalls++;
        throw new Error("should not fetch when already present");
      },
    });
    expect(res).toEqual({
      trees: { status: "skipped" },
      enrichment: { status: "skipped" },
    });
    expect(fetchCalls).toBe(0);
  });

  it("treats the committed City of Melbourne fallback as needing upgrade to the full release", () => {
    const publicDir = tempPublicDir();
    writeFileSync(join(publicDir, "building-enrichment.pmtiles"), Buffer.alloc(3_800_000, 1));
    writeFileSync(
      join(publicDir, "building-enrichment-manifest.json"),
      JSON.stringify({ regionName: "City of Melbourne (committed fallback)" }),
    );
    expect(hasFullBuildingEnrichment(publicDir)).toBe(false);
  });

  it("downloads and SHA-256 verifies trees and building-enrichment into public/", async () => {
    const publicDir = tempPublicDir();
    const treesBytes = Buffer.from("PMTiles-trees-archive-payload");
    const treesManifest = JSON.stringify({
      schemaVersion: 1,
      pmtilesSha256: sha256Hex(treesBytes),
    });
    const enrichBytes = Buffer.from("PMTiles-enrichment-archive-payload");
    const enrichManifest = JSON.stringify({
      schemaVersion: 1,
      regionName: "Greater Melbourne (ABS GCCSA 2GMEL)",
      pmtilesSha256: sha256Hex(enrichBytes),
      pmtilesBytes: enrichBytes.length,
    });

    const responses = new Map([
      ["https://example.test/trees-latest/trees-manifest.json", Buffer.from(treesManifest)],
      ["https://example.test/trees-latest/trees.pmtiles", treesBytes],
      ["https://example.test/building-enrichment-latest/building-enrichment-manifest.json", Buffer.from(enrichManifest)],
      ["https://example.test/building-enrichment-latest/building-enrichment.pmtiles", enrichBytes],
    ]);

    const res = await fetchPrebakedPmtiles({
      publicDir,
      releasesBase: "https://example.test",
      fetchImpl: async (url) => {
        const body = responses.get(String(url));
        if (!body) return new Response("not found", { status: 404 });
        return new Response(body, { status: 200 });
      },
    });

    expect(res.trees.status).toBe("installed");
    expect(res.enrichment.status).toBe("installed");
    expect(readFileSync(join(publicDir, "trees.pmtiles"))).toEqual(treesBytes);
    expect(readFileSync(join(publicDir, "building-enrichment.pmtiles"))).toEqual(enrichBytes);
  });

  it("does not throw or overwrite committed fallback when download fails or SHA-256 mismatches", async () => {
    const publicDir = tempPublicDir();
    const fallbackBytes = Buffer.from("committed-fallback-bytes");
    writeFileSync(join(publicDir, "building-enrichment.pmtiles"), fallbackBytes);
    writeFileSync(
      join(publicDir, "building-enrichment-manifest.json"),
      JSON.stringify({ regionName: "City of Melbourne (committed fallback)" }),
    );

    const treesRes = await ensurePrebakedTrees({
      publicDir,
      releasesBase: "https://example.test",
      fetchImpl: async () => new Response("server error", { status: 503 }),
    });
    expect(treesRes.status).toBe("failed");

    const enrichRes = await ensureFullBuildingEnrichment({
      publicDir,
      releasesBase: "https://example.test",
      fetchImpl: async (url) => {
        if (String(url).endsWith(".json")) {
          return new Response(JSON.stringify({ pmtilesSha256: "0000" }), { status: 200 });
        }
        return new Response(Buffer.from("corrupted"), { status: 200 });
      },
    });
    expect(enrichRes.status).toBe("failed");
    expect(readFileSync(join(publicDir, "building-enrichment.pmtiles"))).toEqual(fallbackBytes);
  });
});
