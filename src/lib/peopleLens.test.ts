import { describe, expect, it } from "vitest";
import { CENSUS_FIELDS, type CensusValues, type SelectedSa1 } from "./censusPeople";
import { aggregateLens, buildLensIndex, clampLensCentre, lensShares, lensWeights, pointInWalk } from "./peopleLens";
import { walkCircle } from "./walkIsochrone";

type Pt = [number, number];

function vals(o: Partial<CensusValues>): CensusValues {
  const v = {} as CensusValues;
  for (const f of CENSUS_FIELDS) v[f] = o[f] ?? 0;
  return v;
}

function square(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}

function sa1(code: string, ring: Pt[], v: Partial<CensusValues>, km2 = 0.5): SelectedSa1 {
  return { code, sa2Code: "x", values: vals(v), fraction: 1, clippedKm2: km2, rings: [ring], clipped: [[ring]], containsCentre: false };
}

const west = sa1("W", square(-500, -500, 0, 500), { pop: 1000, medAge: 30, tenRent: 300, tenOwned: 700, twHome: 10, twCar: 90 });
const east = sa1("E", square(0, -500, 500, 500), { pop: 3000, medAge: 50, tenRent: 1500, tenOwned: 1500 });
const index = buildLensIndex([west, east], 1000, "square", 100);

describe("people lens aggregation", () => {
  it("centroid method counts whole SA1s whose centroid is inside", () => {
    const r = aggregateLens(index, walkCircle([-250, 0], 100), "centroid");
    expect(r.sa1Codes).toEqual(["W"]);
    expect(r.people).toBe(1000);
    expect(r.estimated).toBe(false);
  });

  it("area method weights by the share of each SA1 inside the circle", () => {
    const r = aggregateLens(index, walkCircle([-250, 0], 200), "area");
    const expected = (Math.PI * 200 * 200) / (500 * 1000);
    expect(r.estimated).toBe(true);
    expect(r.people / 1000).toBeCloseTo(expected, 1);
  });

  it("moving the lens changes the count", () => {
    const a = aggregateLens(index, walkCircle([-250, 0], 200), "area").people;
    const b = aggregateLens(index, walkCircle([250, 0], 200), "area").people;
    expect(b).toBeGreaterThan(a * 2);
  });

  it("never sums medians", () => {
    const r = aggregateLens(index, walkCircle([0, 0], 400), "area");
    expect(r.values.medAge).toBe(0);
  });

  it("weights stay in 0..1", () => {
    for (const w of lensWeights(index, walkCircle([0, 0], 400), "area")) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("shares come from counts", () => {
    const s = lensShares(aggregateLens(index, walkCircle([-250, 0], 100), "centroid").values);
    expect(s.renters).toBeCloseTo(0.3);
    expect(s.wfh).toBeCloseTo(0.1);
  });

  it("clamps the centre inside the frame", () => {
    const [x, y] = clampLensCentre([5000, -5000], 1000, "square");
    expect(Math.abs(x)).toBeLessThanOrEqual(500);
    expect(Math.abs(y)).toBeLessThanOrEqual(500);
  });

  it("area method respects holes in the walking polygon", () => {
    const outer = square(-500, -500, 0, 500).slice(0, 4);
    const hole = square(-400, -400, -100, 400).slice(0, 4);
    const full = aggregateLens(index, [[outer]], "area").people;
    const holed = aggregateLens(index, [[outer, hole]], "area").people;
    expect(full).toBeCloseTo(1000, 0);
    expect(holed / 1000).toBeCloseTo(1 - (300 * 800) / (500 * 1000), 1);
  });

  it("area method sums every part of a multipolygon", () => {
    const a = square(-450, -450, -350, -350).slice(0, 4);
    const b = square(350, 350, 450, 450).slice(0, 4);
    const r = aggregateLens(index, [[a], [b]], "area");
    expect(r.sa1Codes.sort()).toEqual(["E", "W"]);
    expect(r.people).toBeCloseTo((1000 + 3000) * ((100 * 100) / (500 * 1000)), 0);
  });
});

describe("people lens on a concave walking polygon", () => {
  const north = sa1("N", square(-100, 160, 100, 340), { pop: 500 }, 0.036);
  const south = sa1("S", square(-100, -340, 100, -160), { pop: 500 }, 0.036);
  const middle = sa1("M", square(150, -100, 350, 100), { pop: 800 }, 0.04);
  const concave = buildLensIndex([north, south, middle], 1000, "square", 200);
  const cShape: Pt[] = [
    [-150, -350],
    [400, -350],
    [400, -150],
    [50, -150],
    [50, 150],
    [400, 150],
    [400, 350],
    [-150, 350],
  ];

  it("a circle that would include the middle SA1 is matched by the concave walk excluding it", () => {
    const circle = aggregateLens(concave, walkCircle([0, 0], 400), "centroid");
    expect(circle.sa1Codes).toContain("M");
    const walk = aggregateLens(concave, [[cShape]], "centroid");
    expect(walk.sa1Codes.sort()).toEqual(["N", "S"]);
    expect(walk.people).toBe(1000);
  });

  it("area-weighted counting leaves out the SA1 in the notch", () => {
    const walk = aggregateLens(concave, [[cShape]], "area");
    expect(walk.sa1Codes).not.toContain("M");
    expect(walk.people).toBeCloseTo(1000, -1);
    expect(walk.estimated).toBe(true);
  });

  it("point-in-walk respects holes and multipolygons", () => {
    const outer = square(-10, -10, 10, 10).slice(0, 4);
    const hole = square(-5, -5, 5, 5).slice(0, 4);
    const far = square(100, 100, 110, 110).slice(0, 4);
    expect(pointInWalk([7, 7], [[outer, hole]])).toBe(true);
    expect(pointInWalk([0, 0], [[outer, hole]])).toBe(false);
    expect(pointInWalk([105, 105], [[outer, hole], [far]])).toBe(true);
    expect(pointInWalk([50, 50], [[outer, hole], [far]])).toBe(false);
  });
});
