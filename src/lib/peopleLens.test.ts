import { describe, expect, it } from "vitest";
import { CENSUS_FIELDS, type CensusValues, type SelectedSa1 } from "./censusPeople";
import { aggregateLens, buildLensIndex, clampLensCentre, lensShares, lensWeights } from "./peopleLens";

type Pt = [number, number];

function vals(o: Partial<CensusValues>): CensusValues {
  const v = {} as CensusValues;
  for (const f of CENSUS_FIELDS) v[f] = o[f] ?? 0;
  return v;
}

function square(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}

function sa1(code: string, ring: Pt[], v: Partial<CensusValues>): SelectedSa1 {
  return { code, sa2Code: "x", values: vals(v), fraction: 1, clippedKm2: 0.5, rings: [ring], clipped: [[ring]], containsCentre: false };
}

const west = sa1("W", square(-500, -500, 0, 500), { pop: 1000, medAge: 30, tenRent: 300, tenOwned: 700, twHome: 10, twCar: 90 });
const east = sa1("E", square(0, -500, 500, 500), { pop: 3000, medAge: 50, tenRent: 1500, tenOwned: 1500 });
const index = buildLensIndex([west, east], 1000, "square", 100);

describe("people lens aggregation", () => {
  it("centroid method counts whole SA1s whose centroid is inside", () => {
    const r = aggregateLens(index, [-250, 0], 100, "centroid");
    expect(r.sa1Codes).toEqual(["W"]);
    expect(r.people).toBe(1000);
    expect(r.estimated).toBe(false);
  });

  it("area method weights by the share of each SA1 inside the circle", () => {
    const r = aggregateLens(index, [-250, 0], 200, "area");
    const expected = (Math.PI * 200 * 200) / (500 * 1000);
    expect(r.estimated).toBe(true);
    expect(r.people / 1000).toBeCloseTo(expected, 1);
  });

  it("moving the lens changes the count", () => {
    const a = aggregateLens(index, [-250, 0], 200, "area").people;
    const b = aggregateLens(index, [250, 0], 200, "area").people;
    expect(b).toBeGreaterThan(a * 2);
  });

  it("never sums medians", () => {
    const r = aggregateLens(index, [0, 0], 400, "area");
    expect(r.values.medAge).toBe(0);
  });

  it("weights stay in 0..1", () => {
    for (const w of lensWeights(index, [0, 0], 400, "area")) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("shares come from counts", () => {
    const s = lensShares(aggregateLens(index, [-250, 0], 100, "centroid").values);
    expect(s.renters).toBeCloseTo(0.3);
    expect(s.wfh).toBeCloseTo(0.1);
  });

  it("clamps the centre inside the frame", () => {
    const [x, y] = clampLensCentre([5000, -5000], 1000, "square");
    expect(Math.abs(x)).toBeLessThanOrEqual(500);
    expect(Math.abs(y)).toBeLessThanOrEqual(500);
  });
});
