import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComTreesDetailed } from "./comTrees";
import { dedupeTreesById } from "./overtureBase";
import type { TreeFeat } from "../types";

const tree = (id: number, east: number): TreeFeat => ({
  id,
  at: [east, 0],
  height_m: 10,
  crown_diameter_m: 6,
  trunk_diameter_m: 0.35,
  sizeSource: "default",
  tier: "osm",
});

describe("Overture tree points across overlapping base tiles", () => {
  it("keeps one copy per id, in first-seen order", () => {
    const fromTileA = [tree(1, 0), tree(2, 5)];
    const fromTileB = [tree(2, 5), tree(3, 9)];
    expect(dedupeTreesById([...fromTileA, ...fromTileB]).map((t) => t.id)).toEqual([1, 2, 3]);
  });
});

describe("City of Melbourne live paging", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("asks for a stable order on every page", async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        urls.push(url);
        const offset = Number(url.searchParams.get("offset"));
        const results = offset < 200 ? Array.from({ length: 100 }, (_, i) => ({ latitude: -37.81, longitude: 144.98 + (offset + i) * 1e-6 })) : [];
        return new Response(JSON.stringify({ total_count: 200, results }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const result = await fetchComTreesDetailed({ south: -37.82, west: 144.97, north: -37.8, east: 144.99 });
    expect(result.rows).toHaveLength(200);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.searchParams.get("order_by")).toBe("com_id");
  });
});
