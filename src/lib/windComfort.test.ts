import { describe, expect, it } from "vitest";
import {
  binExceedance,
  COMFORT_CLASS_LABELS,
  COMFORT_CLASSES,
  countUnsafeAreas,
  exceedanceAt,
  fitSectorWeibull,
  isUnsafe,
  LAWSON_EXCEEDANCE,
  LAWSON_STROLLING_MS,
  LAWSON_UNSAFE_EXCEEDANCE,
  lawsonClass,
  sectorReferenceSpeedMs,
  unsafeAreasLabel,
  windSeasonWeights,
} from "./windComfort";
import { WIND_SPEED_BIN_EDGES_MS } from "./windBins";
import type { WindRoseSeasonRecord } from "./windRoseData";

const below = LAWSON_EXCEEDANCE - 1e-6;
const above = LAWSON_EXCEEDANCE + 1e-6;

function record(sectors: number[][], calmPct: number): WindRoseSeasonRecord {
  return { calmPct, prevailingDirDeg: 0, meanSpeedMs: 3, sectors };
}

function emptySectors(): number[][] {
  return Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]);
}

describe("lawsonClass", () => {
  const none = { p4: 0, p6: 0, p8: 0, p10: 0 };

  it("classifies at and around each 5% comfort threshold", () => {
    expect(lawsonClass({ ...none, p4: LAWSON_EXCEEDANCE })).toBe("sitting");
    expect(lawsonClass({ ...none, p4: below })).toBe("sitting");
    expect(lawsonClass({ ...none, p4: above })).toBe("standing");
    expect(lawsonClass({ ...none, p4: above, p6: LAWSON_EXCEEDANCE })).toBe("standing");
    expect(lawsonClass({ ...none, p4: 1, p6: below })).toBe("standing");
    expect(lawsonClass({ ...none, p4: 1, p6: above })).toBe("strolling");
    expect(lawsonClass({ ...none, p4: 1, p6: above, p8: LAWSON_EXCEEDANCE })).toBe("strolling");
    expect(lawsonClass({ ...none, p4: 1, p6: 1, p8: below })).toBe("strolling");
    expect(lawsonClass({ ...none, p4: 1, p6: 1, p8: above })).toBe("walking");
    expect(lawsonClass({ p4: 1, p6: 1, p8: above, p10: LAWSON_EXCEEDANCE })).toBe("walking");
    expect(lawsonClass({ p4: 1, p6: 1, p8: 1, p10: below })).toBe("walking");
    expect(lawsonClass({ p4: 1, p6: 1, p8: 1, p10: above })).toBe("uncomfortable");
  });

  it("splits the old 6–10 m/s walking range at 8 m/s", () => {
    const sectors = emptySectors();
    sectors[0] = [0, 0, 0, 1, 0];
    const weights = windSeasonWeights(record(sectors, 0), WIND_SPEED_BIN_EDGES_MS);
    const at = (ratio: number) => lawsonClass(exceedanceAt(weights, () => ratio));
    expect(LAWSON_STROLLING_MS).toBe(8);
    expect(at(0.5)).toBe("standing");
    expect(at(0.65)).toBe("strolling");
    expect(at(0.85)).toBe("walking");
    expect(at(1)).toBe("uncomfortable");
  });

  it("keeps the five comfort classes in legend order with Strolling and no Unsafe", () => {
    expect([...COMFORT_CLASSES]).toEqual(["sitting", "standing", "strolling", "walking", "uncomfortable"]);
    expect(COMFORT_CLASSES.map((cls) => COMFORT_CLASS_LABELS[cls])).toEqual([
      "Sitting",
      "Standing",
      "Strolling",
      "Walking",
      "Uncomfortable",
    ]);
  });
});

describe("isUnsafe", () => {
  it("flags 15 m/s for more than 0.022% as a safety flag, separate from the comfort band", () => {
    expect(isUnsafe({ p15: LAWSON_UNSAFE_EXCEEDANCE })).toBe(false);
    expect(isUnsafe({ p15: LAWSON_UNSAFE_EXCEEDANCE + 1e-7 })).toBe(true);
    expect(lawsonClass({ p4: 0, p6: 0, p8: 0, p10: 0 })).toBe("sitting");
  });
});

describe("windSeasonWeights", () => {
  it("sums to 1 with calm included", () => {
    const sectors = emptySectors();
    sectors[0] = [0.1, 0.2, 0.05, 0.01, 0.001];
    sectors[4] = [0.12, 0.08, 0.02, 0, 0];
    sectors[9] = [0.05, 0.1, 0.03, 0.002, 0];
    const weights = windSeasonWeights(record(sectors, 21.7), WIND_SPEED_BIN_EDGES_MS);
    const total = weights.calm + weights.bins.reduce((sum, bin) => sum + bin.weight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    expect(weights.calm).toBeGreaterThan(0);
  });

  it("uses the real Viewbank-style bin edges and an open top bin", () => {
    const sectors = emptySectors();
    sectors[2] = [0, 0, 0, 0, 1];
    const weights = windSeasonWeights(record(sectors, 0), WIND_SPEED_BIN_EDGES_MS);
    expect(weights.bins).toHaveLength(1);
    expect(weights.bins[0]!.openTop).toBe(true);
    expect(weights.bins[0]!.loMs).toBeCloseTo(40 / 3.6, 9);
  });
});

describe("binExceedance", () => {
  it("spreads speed evenly across a closed bin", () => {
    const bin = { loMs: 2, hiMs: 6, openTop: false };
    expect(binExceedance(bin, 1)).toBe(1);
    expect(binExceedance(bin, 4)).toBeCloseTo(0.5, 12);
    expect(binExceedance(bin, 5)).toBeCloseTo(0.25, 12);
    expect(binExceedance(bin, 6)).toBe(0);
  });

  it("decays smoothly above an open top bin when no tail was fitted", () => {
    const bin = { loMs: 11, hiMs: 14, openTop: true };
    expect(binExceedance(bin, 11)).toBe(1);
    expect(binExceedance(bin, 14)).toBeCloseTo(Math.exp(-1), 12);
    expect(binExceedance(bin, 17)).toBeLessThan(binExceedance(bin, 14));
  });

  it("follows the fitted Weibull above an open top bin", () => {
    const tail = { shape: 2, scaleMs: 6 };
    const bin = { loMs: 11, hiMs: 14, openTop: true, tail };
    const survive = (u: number) => Math.exp(-((u / 6) ** 2));
    expect(binExceedance(bin, 11)).toBe(1);
    expect(binExceedance(bin, 20)).toBeCloseTo(survive(20) / survive(11), 12);
  });
});

describe("fitSectorWeibull", () => {
  const edges = WIND_SPEED_BIN_EDGES_MS;
  const survive = (u: number, k: number, c: number) => Math.exp(-((u / c) ** k));

  it("recovers the shape and scale of a Weibull wind climate from its bins", () => {
    const k = 2;
    const c = 6;
    const freqs = [0, 1, 2, 3, 4].map((band) => survive(edges[band]!, k, c) - (band === 4 ? 0 : survive(edges[band + 1]!, k, c)));
    const fit = fitSectorWeibull(freqs, edges)!;
    expect(fit.shape).toBeCloseTo(k, 1);
    expect(fit.scaleMs).toBeCloseTo(c, 0);
  });

  it("gives up on a direction with too few bins to fit", () => {
    expect(fitSectorWeibull([0, 0, 0, 0, 0.9], edges)).toBeNull();
    expect(fitSectorWeibull([0, 0, 0, 0, 0], edges)).toBeNull();
  });

  it("puts open ground in a windy Weibull climate well under the unsafe limit", () => {
    const sectors = emptySectors();
    sectors[0] = [0, 1, 2, 3, 4].map((band) => survive(edges[band]!, 2, 6.2) - (band === 4 ? 0 : survive(edges[band + 1]!, 2, 6.2)));
    const weights = windSeasonWeights(record(sectors, 0), edges);
    expect(weights.bins.find((bin) => bin.openTop)?.tail).toBeDefined();
    expect(isUnsafe(exceedanceAt(weights, () => 0.62))).toBe(false);
  });
});

describe("exceedanceAt", () => {
  it("scales each direction by its own speed ratio", () => {
    const sectors = emptySectors();
    sectors[0] = [0, 0, 0.5, 0, 0];
    sectors[8] = [0, 0, 0.5, 0, 0];
    const weights = windSeasonWeights(record(sectors, 0), WIND_SPEED_BIN_EDGES_MS);
    const open = exceedanceAt(weights, () => 1);
    const lee = exceedanceAt(weights, (s) => (s === 0 ? 0.2 : 1));
    expect(lee.p4).toBeLessThan(open.p4);
    expect(lee.p4).toBeCloseTo(open.p4 / 2, 9);
  });

  it("gives a direction's reference speed from its bins", () => {
    const sectors = emptySectors();
    sectors[3] = [0, 1, 0, 0, 0];
    const weights = windSeasonWeights(record(sectors, 50), WIND_SPEED_BIN_EDGES_MS);
    expect(sectorReferenceSpeedMs(weights, 3)).toBeCloseTo((10 / 3.6 + 20 / 3.6) / 2, 9);
    expect(sectorReferenceSpeedMs(weights, 4)).toBeNull();
  });
});

describe("countUnsafeAreas", () => {
  const cols = 6;
  const rows = 5;
  const maskOf = (cells: Array<[number, number]>) => {
    const mask = new Uint8Array(cols * rows);
    for (const [i, j] of cells) mask[j * cols + i] = 1;
    return mask;
  };

  it("counts none, one and two separate blobs", () => {
    expect(countUnsafeAreas(maskOf([]), cols, rows)).toBe(0);
    expect(countUnsafeAreas(maskOf([[1, 1], [2, 1], [2, 2]]), cols, rows)).toBe(1);
    expect(countUnsafeAreas(maskOf([[0, 0], [1, 0], [4, 3], [5, 3], [5, 4]]), cols, rows)).toBe(2);
  });

  it("treats cells touching only at a corner as separate areas", () => {
    expect(countUnsafeAreas(maskOf([[1, 1], [2, 2]]), cols, rows)).toBe(2);
  });

  it("labels the card", () => {
    expect(unsafeAreasLabel(0)).toBe("Unsafe: none");
    expect(unsafeAreasLabel(1)).toBe("Unsafe: 1 area");
    expect(unsafeAreasLabel(2)).toBe("Unsafe: 2 areas");
  });
});
