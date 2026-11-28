import { describe, expect, it } from "vitest";
import type { SiteWindSelection, WindRoseAsset, WindRoseSeasonRecord } from "./windRoseData";
import { analyzeSiteWind, seasonRecord } from "./windRoseStats";
import { prevailingStreams } from "./windPrevailingStreams";

function bins(north: number, south: number): number[][] {
  return Array.from({ length: 16 }, (_, sector) => {
    if (sector === 0) return [north, 0, 0, 0, 0];
    if (sector === 8) return [south, 0, 0, 0, 0];
    return [0, 0, 0, 0, 0];
  });
}

function record(north: number, south: number, dir: number, mean: number): WindRoseSeasonRecord {
  return {
    calmPct: 0,
    prevailingDirDeg: dir,
    meanSpeedMs: mean,
    sectors: bins(north, south),
    sectorMeanSpeedMs: Array.from({ length: 16 }, (_, sector) => (sector === 0 ? 4 : sector === 8 ? 5 : 0)),
    morning: {
      calmPct: 0,
      prevailingDirDeg: 0,
      meanSpeedMs: 4,
      sectors: bins(0.27, 0.03),
      sectorMeanSpeedMs: Array.from({ length: 16 }, (_, sector) => (sector === 0 ? 4 : sector === 8 ? 3 : 0)),
    },
    afternoon: {
      calmPct: 0,
      prevailingDirDeg: 180,
      meanSpeedMs: 5,
      sectors: bins(0.03, 0.27),
      sectorMeanSpeedMs: Array.from({ length: 16 }, (_, sector) => (sector === 0 ? 3 : sector === 8 ? 5 : 0)),
    },
  };
}

const asset: WindRoseAsset = {
  version: 3,
  speedBinEdgesMs: [0.5, 2, 4, 6, 8, 100],
  source: "test",
  stations: [
    {
      id: "948680",
      name: "Melbourne Regional Office",
      lat: -37.8,
      lon: 144.97,
      periodStart: "1954",
      periodEnd: "2015",
      seasons: {
        annual: record(0.18, 0.12, 0, 4.2),
        summer: record(0.18, 0.12, 0, 4.2),
        autumn: record(0.18, 0.12, 0, 4.2),
        winter: record(0.18, 0.12, 0, 4.2),
        spring: record(0.18, 0.12, 0, 4.2),
      },
    },
  ],
};

const selection: SiteWindSelection = {
  asset,
  station: {
    id: "948680",
    name: "Melbourne Regional Office",
    lat: -37.8,
    lon: 144.97,
    periodStart: "1954",
    periodEnd: "2015",
    source: "test",
    reason: "nearest",
    skippedCloser: [],
  },
};

describe("daypart ranking", () => {
  it("keeps All day streams unchanged and ranks Morning and Afternoon from their own hours", () => {
    const allDay = prevailingStreams(analyzeSiteWind(selection, "annual"));
    const implied = prevailingStreams(analyzeSiteWind(selection, "annual", "all"));
    expect(allDay.map((s) => s.label)).toEqual(["N", "S"]);
    expect(implied.map((s) => s.label)).toEqual(["N", "S"]);
    expect(seasonRecord(selection, "annual")?.prevailingDirDeg).toBe(0);
    expect(prevailingStreams(analyzeSiteWind(selection, "annual", "morning")).map((s) => s.label)).toEqual(["N"]);
    expect(prevailingStreams(analyzeSiteWind(selection, "annual", "afternoon")).map((s) => s.label)).toEqual(["S"]);
    expect(seasonRecord(selection, "annual", "morning")?.prevailingDirDeg).toBe(0);
    expect(seasonRecord(selection, "annual", "afternoon")?.prevailingDirDeg).toBe(180);
  });
});
