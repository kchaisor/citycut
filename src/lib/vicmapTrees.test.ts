import { describe, expect, it, vi } from "vitest";
import {
  VICMAP_PAGE_SIZE,
  fetchVicmapTrees,
  nextVicmapOffset,
  parseVicmapPage,
  vicmapPageUrl,
  vicmapPointsToTrees,
} from "./vicmapTrees";

const bounds = { south: -37.81, west: 144.94, north: -37.79, east: 144.96 };

function feature(lon: number, lat: number, height: unknown, radius: unknown, dense?: unknown) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { height_m: height, canopy_radius_m: radius, dense_canopy: dense ?? null },
  };
}

describe("Vicmap pages", () => {
  it("builds an envelope query for the frame with the fields the model uses", () => {
    const url = new URL(vicmapPageUrl(bounds, 2000));
    expect(url.searchParams.get("f")).toBe("geojson");
    expect(url.searchParams.get("outFields")).toBe("height_m,canopy_radius_m,dense_canopy");
    expect(url.searchParams.get("resultOffset")).toBe("2000");
    expect(url.searchParams.get("resultRecordCount")).toBe(String(VICMAP_PAGE_SIZE));
    expect(url.searchParams.get("geometryPrecision")).toBe("6");
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
    const geometry = JSON.parse(url.searchParams.get("geometry") ?? "{}") as { xmin: number; ymax: number };
    expect(geometry.xmin).toBeCloseTo(bounds.west);
    expect(geometry.ymax).toBeCloseTo(bounds.north);
  });

  it("drops a bad height or position, derives a crown when the radius is unusable, and reports another page", () => {
    const page = parseVicmapPage({
      type: "FeatureCollection",
      properties: { exceededTransferLimit: true },
      features: [
        feature(144.95, -37.8, 0, 3),
        feature(144.951, -37.8, 10, -2),
        feature(Number.NaN, -37.8, 10, 2),
        feature(144.952, -37.801, 12, 4, "Y"),
      ],
    });
    expect(page.points).toHaveLength(2);
    expect(page.dropped).toBe(3);
    expect(page.exceeded).toBe(true);
    expect(page.points[0]).toMatchObject({ height_m: 10, crown_m: null, dense: false });
    expect(page.points[1]).toMatchObject({ height_m: 12, crown_m: 8, dense: true });
    expect(nextVicmapOffset(0, page)).toBe(VICMAP_PAGE_SIZE);
    expect(nextVicmapOffset(2000, { count: 400, exceeded: false })).toBeNull();
    expect(nextVicmapOffset(0, { count: VICMAP_PAGE_SIZE, exceeded: false })).toBe(VICMAP_PAGE_SIZE);
  });

  it("follows resultOffset until a short page and logs rejected values", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        const offset = Number(new URL(String(url)).searchParams.get("resultOffset"));
        const count = offset === 0 ? VICMAP_PAGE_SIZE : 3;
        const features = Array.from({ length: count }, (_, index) => {
          if (offset === 0 && index === 0) return feature(144.95, -37.8, Number.NaN, 2);
          return feature(144.95 + index * 0.00002, -37.8, 9 + (index % 5), 2.5, index % 2 ? "Y" : "N");
        });
        return {
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            properties: { exceededTransferLimit: offset === 0 },
            features,
          }),
        };
      }),
    );
    try {
      const points = await fetchVicmapTrees(bounds);
      expect(urls).toHaveLength(2);
      expect(urls[1]).toContain("resultOffset=2000");
      expect(points).toHaveLength(VICMAP_PAGE_SIZE - 1 + 3);
      expect(points.some((point) => point.dense)).toBe(true);
      expect(info).toHaveBeenCalledWith(expect.stringContaining("dropped 1 Vicmap"));
      const trees = vicmapPointsToTrees(points, { lon: 144.95, lat: -37.8 }, 500);
      expect(trees.length).toBeGreaterThan(0);
      expect(trees.every((point) => point.tier === "vicmap" && point.sizeSource === "vicmap")).toBe(true);
      expect(trees.every((point) => point.height_m >= 2 && point.height_m <= 40)).toBe(true);
      expect(trees.every((point) => point.crown_diameter_m <= point.height_m * 1.4)).toBe(true);
      expect(new Set(trees.map((point) => point.height_m)).size).toBeGreaterThan(1);
    } finally {
      info.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
