import { describe, expect, it } from "vitest";
import { squareBBox } from "./geo";
import type { BuildingFeat, Pt } from "../types";
import { TIER_TIMEOUT_MS, assignExternalUses, refineBuildingUses, zoneWfsUrl } from "./useCascade";

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

function bare(ring: Pt[], height: number, heightFromFallback = false): BuildingFeat {
  return {
    id: 1,
    ring,
    holes: [],
    height,
    heightFromFallback,
    use: "unclassified",
    source: "none",
  };
}

describe("zone tier", () => {
  it("applies zone default height for fallback buildings", () => {
    const home = { ...bare(square([0, 0], 20), 9, true), id: 1 };
    const zone = { code: "GRZ1", outer: square([0, 0], 200), holes: [], area: 40000 };
    const result = assignExternalUses([home], [zone]);
    expect(result[0]).toMatchObject({ height: 7, use: "residential", source: "zone" });
  });

  it("assigns a zone, including the C1Z height split", () => {
    const low = bare(square([0, 0], 20), 9);
    const tall = { ...bare(square([40, 0], 20), 18), id: 2 };
    const zone = {
      code: "C1Z",
      outer: square([20, 0], 200),
      holes: [],
      area: 40000,
    };
    const result = assignExternalUses([low, tall], [zone]);
    expect(result[0]).toMatchObject({ use: "retail", source: "zone" });
    expect(result[1]).toMatchObject({ use: "commercial", source: "zone" });
  });

  it("picks the smallest zone that contains the building and skips a hole", () => {
    const insideHole = bare(square([0, 0], 10), 9);
    const inRing = { ...bare(square([35, 0], 10), 9), id: 2 };
    const outerOnly = { ...bare(square([70, 0], 10), 9), id: 3 };
    const small = {
      code: "C1Z",
      outer: square([0, 0], 100),
      holes: [square([0, 0], 40)],
      area: 8400,
    };
    const large = {
      code: "GRZ1",
      outer: square([40, 0], 220),
      holes: [],
      area: 48400,
    };
    const result = assignExternalUses([insideHole, inRing, outerOnly], [large, small]);
    expect(result.find((building) => building.id === 1)).toMatchObject({ use: "residential", source: "zone" });
    expect(result.find((building) => building.id === 2)).toMatchObject({ use: "retail", source: "zone" });
    expect(result.find((building) => building.id === 3)).toMatchObject({ use: "residential", source: "zone" });
  });

  it("leaves an already tagged building alone", () => {
    const tagged: BuildingFeat = {
      ...bare(square([0, 0], 20), 9),
      use: "civic",
      source: "osm_tag",
    };
    const zone = { code: "IN1Z", outer: square([0, 0], 80), holes: [], area: 6400 };
    expect(assignExternalUses([tagged], [zone])[0]).toMatchObject({ use: "civic", source: "osm_tag" });
  });

  it("reports zones unavailable and leaves the building unclassified", async () => {
    expect(TIER_TIMEOUT_MS).toBe(15_000);
    const melbourne = { lat: -37.8136, lon: 144.9631 };
    const bounds = squareBBox(melbourne, 1000);
    const zoneUrl = decodeURIComponent(zoneWfsUrl(bounds));
    expect(zoneUrl).toContain("open-data-platform:plan_zone");
    expect(zoneUrl).toContain(",CRS:84");
    const urls: string[] = [];
    const fetchImpl = ((url: string) => {
      urls.push(String(url));
      return Promise.resolve(new Response("busy", { status: 429 }));
    }) as typeof fetch;
    const result = await refineBuildingUses([bare(square([0, 0], 16), 8)], melbourne, bounds, { fetchImpl });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("opendata.maps.vic.gov.au");
    expect(urls[0]).not.toContain("melbourne.vic.gov.au");
    expect(result.failures.map((failure) => failure.message)).toEqual(["zones unavailable"]);
    expect(result.buildings[0]).toMatchObject({ use: "unclassified", source: "none" });
  });
});
