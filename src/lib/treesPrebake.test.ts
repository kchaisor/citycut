import { readFileSync } from "node:fs";
import { PMTiles } from "pmtiles";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bboxCovers,
  clearPrebakedTreesCache,
  loadPrebakedTrees,
  OSM_TREES_ODBL_CREDIT,
  PAGES_TREES_MANIFEST_URL,
  prebakeBackupNote,
  prebakeSourceNote,
  tilesForBounds,
  TREES_MANIFEST_URL,
  type TreesManifest,
} from "./treesPrebake";
import { overtureTreesFromPoints } from "./overtureBase";
import { vicmapPointsToTrees } from "./vicmapTrees";

const bytes = readFileSync(new URL("./test/fixtures/trees-mini.pmtiles", import.meta.url));
const archive = () =>
  new PMTiles({
    getKey: () => "mini",
    getBytes: async (offset: number, length: number) => ({
      data: bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + length),
    }),
  });

const manifest: TreesManifest = {
  schema: 1,
  generatedAt: "2026-10-12T05:10:00.000Z",
  bbox: { west: 144.333634, south: -38.502988, east: 145.878412, north: -37.175099 },
  zoom: 14,
  sourceStamps: {
    vicmapDataLastEdit: "2025-06-04T06:35:29.633Z",
    comDataProcessed: "2025-09-22T01:33:55+00:00",
    overtureRelease: "2026-09-23.1",
  },
};
// Spans the z14 tile edge at lon 145.01953125 (x 14791 | 14792).
const bounds = { west: 145.005, south: -37.855, east: 145.025, north: -37.84 };

describe("pre-baked tree reader", () => {
  afterEach(() => {
    clearPrebakedTreesCache();
    vi.unstubAllGlobals();
  });
  it("reads every source for the cut, once each, inside the bounds", async () => {
    const result = await loadPrebakedTrees(bounds, undefined, { fetchManifest: async () => manifest, archive: archive() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { vicmap, com, osm, tiles } = result.trees;
    expect(tiles).toBe(tilesForBounds(bounds, 14).length);
    // 3 Vicmap points in bounds (one outside is dropped); the edge point is in two tiles but read once.
    expect(vicmap).toHaveLength(3);
    const first = vicmap.find((p) => Math.abs(p.lon - 145.01) < 1e-6)!;
    expect(first).toMatchObject({ height_m: 10.5, crown_m: 6.5, dense: false });
    const dense = vicmap.find((p) => Math.abs(p.lon - 145.011) < 1e-6)!;
    expect(dense).toMatchObject({ height_m: 8, crown_m: null, dense: true });
    expect(com).toHaveLength(2);
    expect(com.find((c) => c.genus === "Ulmus")).toMatchObject({ dbh_cm: 42, age: "Mature", scientific: "Ulmus procera" });
    expect(com.find((c) => c.genus === null)?.dbh_cm).toBeNull();
    expect(osm.map((o) => o.sid).sort((a, b) => a - b)).toEqual([42, 123456789]);
    // Placement survives the tile grid to about a decimetre.
    expect(Math.abs(first.lat - -37.848)).toBeLessThan(1.5e-6);
  });

  it("feeds the same converters as the live fetch", async () => {
    const result = await loadPrebakedTrees(bounds, undefined, { fetchManifest: async () => manifest, archive: archive() });
    if (!result.ok) throw new Error(result.reason);
    const center = { lat: -37.8475, lon: 145.015 };
    const trees = vicmapPointsToTrees(result.trees.vicmap, center, 2000);
    expect(trees.every((t) => t.tier === "vicmap" && t.sizeSource === "vicmap")).toBe(true);
    const osm = overtureTreesFromPoints(result.trees.osm, center, 2000);
    expect(osm.find((t) => t.id === 42)?.height_m).toBe(12);
  });

  it("explains why it cannot be used", async () => {
    const missing = await loadPrebakedTrees(bounds, undefined, {
      fetchManifest: async () => {
        throw new Error("the pre-baked tree manifest answered HTTP 404");
      },
    });
    expect(missing).toEqual({ ok: false, reason: "the pre-baked tree manifest answered HTTP 404" });
    const outside = await loadPrebakedTrees({ west: 143.8, south: -38.2, east: 143.9, north: -38.1 }, undefined, {
      fetchManifest: async () => manifest,
      archive: archive(),
    });
    expect(outside).toEqual({ ok: false, reason: "this cut is outside the pre-baked Greater Melbourne extent" });
    const broken = await loadPrebakedTrees(bounds, undefined, {
      fetchManifest: async () => manifest,
      archive: { getHeader: async () => { throw new Error("Bad response code: 503"); }, getZxy: async () => undefined },
    });
    expect(broken).toEqual({ ok: false, reason: "trees.pmtiles answered HTTP 503" });
  });

  it("falls back to GitHub Pages trees-manifest.json when local manifest returns 404 (e.g. on Vercel)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.referrerPolicy).toBe("no-referrer");
      if (url === TREES_MANIFEST_URL) {
        return new Response("Not Found", { status: 404 });
      }
      if (url === PAGES_TREES_MANIFEST_URL) {
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadPrebakedTrees(bounds, undefined, { archive: archive() });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows an abort instead of falling back", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadPrebakedTrees(bounds, controller.signal, {
        fetchManifest: async () => {
          throw new DOMException("Aborted", "AbortError");
        },
      }),
    ).rejects.toThrow(/Aborted/);
  });
});

describe("pre-bake notes and credit", () => {
  it("names the data dates and the rounding", () => {
    expect(prebakeSourceNote(manifest, true)).toBe(
      "Trees read from the pre-baked tree file built 2026-10-12 (Vicmap data 2025-06-04, City of Melbourne data 2025-09-22, OpenStreetMap via Overture 2026-09-23.1); Vicmap heights and crowns are rounded to 0.5 m.",
    );
  });
  it("says plainly when the backup was used", () => {
    expect(prebakeBackupNote("the pre-baked tree manifest answered HTTP 404")).toBe(
      "Trees came from the live servers (backup) because the pre-baked tree file could not be used: the pre-baked tree manifest answered HTTP 404.",
    );
  });
  it("credits OSM under ODbL", () => {
    expect(OSM_TREES_ODBL_CREDIT).toBe("Tree points © OpenStreetMap contributors, ODbL.");
  });
  it("checks coverage on the full cut", () => {
    expect(bboxCovers(manifest.bbox, bounds)).toBe(true);
    expect(bboxCovers(manifest.bbox, { ...bounds, east: 146 })).toBe(false);
  });
});
