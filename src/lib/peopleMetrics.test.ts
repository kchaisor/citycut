import { describe, expect, it } from "vitest";
import { AGE_BANDS, CENSUS_FIELDS, type CensusValues } from "./censusPeople";
import { PEOPLE_PER_DOT, buildDeck, buildQuiz, deckGrid, prismHeights, prismMetricValue, sa1DotModes, scoreGuess } from "./peopleMetrics";

function vals(o: Partial<CensusValues>): CensusValues {
  const v = {} as CensusValues;
  for (const f of CENSUS_FIELDS) v[f] = o[f] ?? 0;
  return v;
}

const ages = Object.fromEntries(AGE_BANDS.map((b, i) => [b.key, [130, 90, 333, 147, 120, 100, 80][i] ?? 50]));
const local = vals({ pop: 1000, ...ages, tenRent: 400, tenOwned: 600, car0: 250, car1: 750, hhLone: 300, hhFamily: 700, twHome: 200, twPt: 300, twCar: 500 });
const gm = vals({ pop: 5000, ...Object.fromEntries(AGE_BANDS.map((b) => [b.key, 700])), tenRent: 1500, tenOwned: 3500, car0: 400, car1: 4600, hhLone: 1000, hhFamily: 4000, twHome: 1000, twCar: 4000 });

describe("prism metric mapping", () => {
  const s = { values: local, fraction: 0.5, clippedKm2: 0.1 };
  it("maps each metric from real counts", () => {
    expect(prismMetricValue(s, "population")).toBe(500);
    expect(prismMetricValue(s, "renters")).toBeCloseTo(0.4);
    expect(prismMetricValue(s, "noCar")).toBeCloseTo(0.25);
    expect(prismMetricValue(s, "wfh")).toBeCloseTo(0.2);
    expect(prismMetricValue(s, "density")).toBeCloseTo(5000);
  });
  it("share metrics map 0..1 to height, counts normalise to the max", () => {
    expect(prismHeights([0.5, 1.2], "renters", 100)).toEqual([50, 100]);
    expect(prismHeights([10, 40], "population", 80)).toEqual([20, 80]);
    expect(prismHeights([0, 0], "population", 80)).toEqual([0, 0]);
  });
  it("one dot per ten workers", () => {
    const dots = sa1DotModes({ values: local, fraction: 1 });
    expect(dots.length).toBe(Math.round(1000 / PEOPLE_PER_DOT));
    expect(dots.filter((m) => m === "home").length).toBe(20);
  });
});

describe("neighbour deck proportions", () => {
  const deck = buildDeck(local, gm);
  it("age cards add up to 100 people", () => {
    const sum = deck.filter((c) => c.group === "age").reduce((a, c) => a + c.ofHundred, 0);
    expect(sum).toBe(100);
  });
  it("every card is 0..100", () => {
    for (const c of deck) {
      expect(c.ofHundred).toBeGreaterThanOrEqual(0);
      expect(c.ofHundred).toBeLessThanOrEqual(100);
    }
  });
  it("grid has 100 cells and fills as cards are seen", () => {
    expect(deckGrid(deck, 0).every((c) => c === null)).toBe(true);
    const all = deckGrid(deck, deck.length);
    expect(all).toHaveLength(100);
    expect(all.every((c) => c !== null)).toBe(true);
  });
  it("quiz scores within 5 points and tracks the streak", () => {
    const q = buildQuiz(local, gm);
    expect(q.find((x) => x.id === "rent")?.real).toBeCloseTo(0.4);
    expect(scoreGuess(0.43, 0.4, 2)).toEqual({ hit: true, offPts: 3, streak: 3 });
    expect(scoreGuess(0.6, 0.4, 2)).toEqual({ hit: false, offPts: 20, streak: 0 });
  });
});
