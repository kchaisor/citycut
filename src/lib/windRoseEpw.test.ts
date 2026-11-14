import { describe, expect, it } from "vitest";
import {
  aggregateEpwSeason,
  parseEpwDataRow,
  parseEpwWindRows,
  SOUTHERN_SEASON_MONTHS,
  speedBinIndexMs,
} from "./windRoseEpw";
import { CALM_SPEED_MS } from "./windRoseData";

const SAMPLE_EPW = `LOCATION,Test,VIC,AUS,TMYx,948700,-37.98,145.10,10.0,15.0
COMMENTS 1,"Period of Record=2009-2023"
DATA PERIODS,1,1,Data,Sunday,1/ 1,12/31
2023,6,15,12,0,?9,12.0,10.0,80,101000,0,0,180,0,0,0,0,0,0,0,180,4.0,9,9,0,0,0,0,0,0,0.0,0,0,0,0,0.0,0.0,0.0
2023,6,15,13,0,?9,12.0,10.0,80,101000,0,0,180,0,0,0,0,0,0,0,180,${CALM_SPEED_MS - 0.01},9,9,0,0,0,0,0,0,0.0,0,0,0,0,0.0,0.0,0.0
2023,12,1,12,0,?9,20.0,10.0,80,101000,0,0,0,0,0,0,0,0,0,0,0,6.0,9,9,0,0,0,0,0,0,0.0,0,0,0,0,0.0,0.0,0.0
`;

describe("windRoseEpw", () => {
  it("maps southern hemisphere seasons", () => {
    expect(SOUTHERN_SEASON_MONTHS.winter).toEqual([6, 7, 8]);
    expect(SOUTHERN_SEASON_MONTHS.summer).toEqual([12, 1, 2]);
  });

  it("treats speeds below 0.5 m/s as calm", () => {
    expect(speedBinIndexMs(0.2)).toBe(-1);
    expect(parseEpwDataRow("2023,1,1,1,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")?.speedMs).toBe(0.49);
  });

  it("aggregates winter hours separately from summer", () => {
    const { rows } = parseEpwWindRows(SAMPLE_EPW);
    const winter = aggregateEpwSeason(rows, "winter");
    const summer = aggregateEpwSeason(rows, "summer");
    expect(winter.calmPct).toBeCloseTo(50, 1);
    expect(summer.sectors[0]!.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(winter.prevailingDirDeg).toBe(180);
  });
});