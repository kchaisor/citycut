import { describe, expect, it } from "vitest";
import type { BuildingFeat, CityModel, Ring, TerrainField } from "../types";
import { buildSectionProfile, niceStep, planLineFor, ringCrossings, squareSpan, storeysFor } from "./sectionProfile";

function box(e: number, n: number, w: number, d: number): Ring {
  return [
    [e - w / 2, n - d / 2],
    [e + w / 2, n - d / 2],
    [e + w / 2, n + d / 2],
    [e - w / 2, n + d / 2],
  ];
}

function building(id: number, ring: Ring, height: number, extra: Partial<BuildingFeat> = {}): BuildingFeat {
  return { id, ring, holes: [], height, use: "residential", source: "clue", ...extra };
}

function model(buildings: BuildingFeat[], terrain: TerrainField | null = null): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 144.96, lat: -37.81 },
    sideM: 200,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings,
    roads: [],
    areas: [],
    trees: [{ id: 9, at: [0, -20], height_m: 8, crown_diameter_m: 6, trunk_diameter_m: 0.4, sizeSource: "default" }],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
    terrain,
  } as CityModel;
}

const slope: TerrainField = {
  cols: 3,
  rows: 3,
  heights: new Float32Array([50, 60, 70, 50, 60, 70, 50, 60, 70]),
  min: 50,
  max: 70,
  spacingM: 100,
  zoom: 14,
  metresPerPixel: 5,
  source: "Mapterhorn",
};

describe("section profile", () => {
  it("clips the cut line to the site square", () => {
    expect(squareSpan({ angleDeg: 0, offsetM: 0, flipped: false }, 200)).toEqual([-100, 100]);
    expect(squareSpan({ angleDeg: 0, offsetM: 150, flipped: false }, 200)).toBeNull();
    const diag = squareSpan({ angleDeg: 45, offsetM: 0, flipped: false }, 200)!;
    expect(diag[1] - diag[0]).toBeCloseTo(200 * Math.SQRT2);
  });

  it("finds where a footprint crosses the plane along the cut", () => {
    const hits = ringCrossings(box(30, 0, 20, 10), { angleDeg: 0, offsetM: 0, flipped: false });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBeCloseTo(20);
    expect(hits[1]).toBeCloseTo(40);
  });

  it("splits buildings into cut, beyond on the looking side, and hidden", () => {
    const m = model([
      building(1, box(30, 0, 20, 10), 12, { numFloors: 4, heightTier: "overture_floors" }),
      building(2, box(-40, -25, 10, 10), 9, { heightTier: "zone_default" }),
      building(3, box(-40, 25, 10, 10), 9),
      building(4, box(0, -90, 10, 4), 30),
    ]);
    const p = buildSectionProfile(m, { angleDeg: 0, offsetM: 0, flipped: false })!;
    expect(p.cut.map((b) => b.id)).toEqual([1]);
    expect(p.cut[0]).toMatchObject({ storeys: 4, storeysEstimated: false, estimated: false, height: 12 });
    expect(p.cut[0].distanceM).toBeCloseTo(130);
    expect(p.beyond.map((b) => b.id)).toEqual([2]);
    expect(p.trees.map((t) => t.id)).toEqual([9]);
    const flipped = buildSectionProfile(m, { angleDeg: 0, offsetM: 0, flipped: true })!;
    expect(flipped.beyond.map((b) => b.id)).toEqual([3]);
    expect(flipped.trees).toHaveLength(0);
    expect(p.datumLabel).toContain("flat ground");
  });

  it("sits ground and buildings on the DEM and labels the datum", () => {
    const m = model([building(1, box(0, 0, 20, 10), 10)], slope);
    const p = buildSectionProfile(m, { angleDeg: 0, offsetM: 0, flipped: false })!;
    expect(p.ground[0][1]).toBeCloseTo(50);
    expect(p.ground[p.ground.length - 1][1]).toBeCloseTo(70);
    expect(p.cut[0].base).toBeCloseTo(59);
    expect(p.cut[0].top).toBeCloseTo(69);
    expect(p.datumLabel).toContain("m AHD");
    expect(p.datumLabel).toContain("approx");
  });

  it("estimates storeys from height when no floor count is known", () => {
    expect(storeysFor({ height: 9.6 })).toEqual({ storeys: 3, estimated: true });
    expect(storeysFor({ height: 9.6, numFloors: 2 })).toEqual({ storeys: 2, estimated: false });
  });

  it("draws plan lines past the site edge with a looking tick", () => {
    const line = planLineFor({ angleDeg: 0, offsetM: 10, flipped: false }, 200)!;
    expect(line.a[1]).toBeCloseTo(10);
    expect(line.a[0]).toBeLessThan(-100);
    expect(line.looking[1]).toBeCloseTo(-1);
    expect(niceStep(37, 4)).toBe(10);
  });
});
