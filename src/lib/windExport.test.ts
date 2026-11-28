import { describe, expect, it } from "vitest";
import { sitePlanChunks } from "./aiPlan";
import type { SiteWindSelection } from "./windRoseData";
import { model } from "./aiExport.test";

function mockSelection(): SiteWindSelection {
  const sectors = Array.from({ length: 16 }, () => [0, 0, 0.01, 0, 0]);
  sectors[8] = [0, 0, 0.08, 0, 0];
  return {
    asset: {
      version: 1,
      speedBinEdgesMs: [0.5, 2.78, 5.56, 8.33, 11.11, 100],
      source: "test",
      stations: [
        {
          id: "948700",
          name: "Melbourne-Moorabbin.AP",
          lat: -37.98,
          lon: 145.096,
          periodStart: "2009",
          periodEnd: "2023",
          seasons: {
            annual: { calmPct: 4, prevailingDirDeg: 180, meanSpeedMs: 3, sectors },
            summer: { calmPct: 4, prevailingDirDeg: 180, meanSpeedMs: 3, sectors },
            autumn: { calmPct: 4, prevailingDirDeg: 180, meanSpeedMs: 3, sectors },
            winter: { calmPct: 4, prevailingDirDeg: 180, meanSpeedMs: 3, sectors },
            spring: { calmPct: 4, prevailingDirDeg: 180, meanSpeedMs: 3, sectors },
          },
        },
      ],
    },
    station: {
      name: "Melbourne-Moorabbin.AP",
      id: "948700",
      lat: -37.98,
      lon: 145.096,
      distanceKm: 12,
      periodStart: "2009",
      periodEnd: "2023",
      reason: "nearest",
      skippedCloser: [],
      source: "climate.onebuilding.org TMYx EPW",
    },
  };
}

describe("wind export layers", () => {
  it("adds Wind only when wind export options are set", () => {
    const off = sitePlanChunks(model(), 1000, undefined, { castShadows: false });
    expect(off.map((chunk) => chunk.name)).not.toContain("Wind");
    const on = sitePlanChunks(model(), 1000, undefined, { wind: { selection: mockSelection(), period: "winter" } });
    expect(on.map((chunk) => chunk.name)).toContain("Wind");
  });
});