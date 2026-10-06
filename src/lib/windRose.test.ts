import { describe, expect, it } from "vitest";
import {
  aggregateHourlyWind,
  analyzeWindPeriod,
  sectorIndex,
  speedBandIndex,
} from "./windRose";
import { WIND_CACHE_VERSION, windCacheKey } from "./windCache";

describe("windRose binning", () => {
  it("maps directions into 16 sectors with wraparound at north", () => {
    expect(sectorIndex(0)).toBe(0);
    expect(sectorIndex(359.9)).toBe(0);
    expect(sectorIndex(11)).toBe(0);
    expect(sectorIndex(12)).toBe(1);
    expect(sectorIndex(90)).toBe(4);
  });

  it("counts calm under 2 km/h separately from speed bands", () => {
    expect(speedBandIndex(1)).toBe(0);
    const table = aggregateHourlyWind(
      -37.82,
      145.1,
      WIND_CACHE_VERSION,
      ["2016-01-01T00:00", "2016-01-01T01:00", "2016-01-01T02:00"],
      [1, 12, 25],
      [0, 90, 180],
    );
    expect(table.calmByMonth[0]).toBe(1);
    expect(table.counts[0]![4]![1]).toBe(1);
    expect(table.counts[0]![8]![2]).toBe(1);
  });

  it("aggregates annual, winter, and single-month periods", () => {
    const times: string[] = [];
    const speeds: number[] = [];
    const dirs: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, "0");
      times.push(`2016-${month}-15T12:00`);
      speeds.push(15);
      dirs.push([6, 7, 8].includes(m) ? 180 : 0);
    }
    const table = aggregateHourlyWind(-37.82, 145.1, WIND_CACHE_VERSION, times, speeds, dirs);
    const annual = analyzeWindPeriod(table, "annual");
    expect(annual.prevailingSector).toBe(0);
    const winter = analyzeWindPeriod(table, "winter");
    expect(winter.prevailingSector).toBe(8);
    const june = analyzeWindPeriod(table, "month-6");
    expect(june.prevailingSector).toBe(8);
    expect(june.calmPercent).toBe(0);
  });
});

describe("wind cache key", () => {
  it("rounds lat/lon to 0.05° and includes version", () => {
    expect(windCacheKey(-37.8207, 145.1053)).toBe("citycut.windRose.v1:-37.80,145.10");
  });
});
