import { describe, expect, it } from "vitest";
import { fromLocal, squareBBox } from "./geo";
import { parseCity } from "./parseOsm";
import type { BuildingFeat, Pt } from "../types";
import {
  CITY_OF_MELBOURNE_BBOX,
  TIER_TIMEOUT_MS,
  assignExternalUses,
  bboxesIntersect,
  clueExportUrl,
  refineBuildingUses,
  zoneWfsUrl,
} from "./useCascade";

const origin = { lon: 144.9631, lat: -37.8136 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

function geom(points: Pt[]) {
  return points.map((point) => fromLocal(point, origin));
}

function bare(ring: Pt[], height: number): BuildingFeat {
  return { id: 1, ring, holes: [], height, use: "unclassified", source: "none" };
}

describe("osm context", () => {
  it("classifies from a POI inside the footprint and leaves a tagged building alone", () => {
    const footprint = geom(square([0, 0], 30));
    const outside = fromLocal([40, 0], origin);
    const parsed = parseCity(
      {
        elements: [
          { type: "way", id: 1, tags: { building: "yes" }, geometry: footprint },
          { type: "way", id: 2, tags: { building: "house" }, geometry: geom(square([80, 0], 20)) },
          { type: "node", id: 3, lat: origin.lat, lon: origin.lon, tags: { shop: "bakery" } },
          { type: "node", id: 4, lat: outside.lat, lon: outside.lon, tags: { shop: "bakery" } },
          { type: "node", id: 5, lat: origin.lat, lon: origin.lon, tags: { building: "apartments" } },
        ],
      },
      origin,
      400,
      { buildings: true, roads: false, waterGreen: false, trees: false },
    );
    const shop = parsed.buildings.find((building) => building.id === 1);
    const house = parsed.buildings.find((building) => building.id === 2);
    expect(shop).toMatchObject({ use: "mixed_use", source: "osm_poi" });
    expect(house).toMatchObject({ use: "residential", source: "osm_tag" });
  });

  it("uses the landuse polygon under the centroid when no POI falls inside", () => {
    const parsed = parseCity(
      {
        elements: [
          { type: "way", id: 1, tags: { building: "yes" }, geometry: geom(square([0, 0], 24)) },
          { type: "way", id: 9, tags: { landuse: "residential" }, geometry: geom(square([0, 0], 80)) },
        ],
      },
      origin,
      400,
      { buildings: true, roads: false, waterGreen: false, trees: false },
    );
    expect(parsed.buildings[0]).toMatchObject({ use: "residential", source: "osm_poi" });
  });
});

describe("external tiers", () => {
  it("lets a zone beat the heuristic, including the C1Z height split", () => {
    const low = bare(square([0, 0], 20), 9);
    const tall = { ...bare(square([40, 0], 20), 18), id: 2 };
    const zone = {
      code: "C1Z",
      outer: square([20, 0], 200),
      holes: [],
      area: 40000,
    };
    const result = assignExternalUses([low, tall], origin, { clue: null, zones: [zone] });
    expect(result[0]).toMatchObject({ use: "retail", source: "zone" });
    expect(result[1]).toMatchObject({ use: "commercial", source: "zone" });
  });

  it("does not call CLUE outside the City of Melbourne", () => {
    const eltham = { lat: -37.7135, lon: 145.148 };
    const bounds = squareBBox(eltham, 1000);
    expect(bboxesIntersect(bounds, CITY_OF_MELBOURNE_BBOX)).toBe(false);
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 });
    }) as typeof fetch;
    return refineBuildingUses([bare(square([0, 0], 6), 4)], eltham, bounds, { fetchImpl }).then((result) => {
      expect(urls.some((url) => url.includes("melbourne"))).toBe(false);
      expect(urls.some((url) => url.includes("geoserver"))).toBe(true);
      expect(result.failures).toEqual([]);
      expect(result.buildings[0]).toMatchObject({ use: "outbuilding", source: "heuristic" });
    });
  });

  it("falls through when zones return 429 and CLUE times out", async () => {
    expect(TIER_TIMEOUT_MS).toBe(15_000);
    const melbourne = { lat: -37.8136, lon: 144.9631 };
    const bounds = squareBBox(melbourne, 1000);
    expect(bboxesIntersect(bounds, CITY_OF_MELBOURNE_BBOX)).toBe(true);
    expect(decodeURIComponent(clueExportUrl(bounds))).toContain("in_bbox(location,");
    expect(decodeURIComponent(zoneWfsUrl(bounds))).toContain(",CRS:84");
    const fetchImpl = ((url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("geoserver")) return Promise.resolve(new Response("busy", { status: 429 }));
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) abort();
        init?.signal?.addEventListener("abort", abort);
      });
    }) as typeof fetch;
    const result = await refineBuildingUses([bare(square([0, 0], 16), 8)], melbourne, bounds, {
      timeoutMs: 30,
      fetchImpl,
    });
    expect(result.failures.map((failure) => failure.message).sort()).toEqual([
      "clue unavailable",
      "zones unavailable",
    ]);
    expect(result.buildings[0]).toMatchObject({ use: "residential", source: "heuristic" });
  });
});
