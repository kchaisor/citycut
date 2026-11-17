import { describe, expect, it } from "vitest";
import {
  binExceedance,
  countUnsafeAreas,
  exceedanceAt,
  LAWSON_EXCEEDANCE,
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
  it("classifies at and around each comfort threshold", () => {
    expect(lawsonClass({ p4: LAWSON_EXCEEDANCE, p6: 0, p10: 0, p15: 0 })).toBe("sitting");
    expect(lawsonClass({ p4: below, p6: 0, p10: 0, p15: 0 })).toBe("sitting");
    expect(lawsonClass({ p4: above, p6: LAWSON_EXCEEDANCE, p10: 0, p15: 0 })).toBe("standing");
    expect(lawsonClass({ p4: above, p6: above, p10: LAWSON_EXCEEDANCE, p15: 0 })).toBe("walking");
    expect(lawsonClass({ p4: 1, p6: above, p10: below, p15: 0 })).toBe("walking");
    expect(lawsonClass({ p4: 1, p6: 1, p10: above, p15: 0 })).toBe("uncomfortable");
  });

  it("lets Unsafe override every comfort band", () => {
    expect(lawsonClass({ p4: 0, p6: 0, p10: 0, p15: LAWSON_UNSAFE_EXCEEDANCE })).toBe("sitting");
    expect(lawsonClass({ p4: 0, p6: 0, p10: 0, p15: LAWSON_UNSAFE_EXCEEDANCE + 1e-7 })).toBe("unsafe");
    expect(lawsonClass({ p4: 1, p6: 1, p10: 1, p15: 0.01 })).toBe("unsafe");
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

  it("decays smoothly above an open top bin", () => {
    const bin = { loMs: 11, hiMs: 14, openTop: true };
    expect(binExceedance(bin, 11)).toBe(1);
    expect(binExceedance(bin, 14)).toBeCloseTo(Math.exp(-1), 12);
    expect(binExceedance(bin, 17)).toBeLessThan(binExceedance(bin, 14));
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
