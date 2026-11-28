import { describe, expect, it } from "vitest";
import {
  aggregateEpwSeason,
  aggregateEpwSeasonDayparts,
  parseEpwDataRow,
  parseEpwPeriodComment,
  parseEpwWindRows,
  SOUTHERN_SEASON_MONTHS,
  speedBinIndexMs,
} from "./windRoseEpw";
import { CALM_SPEED_MS, EPW_WIND_DIR_MISSING, EPW_WIND_SPEED_MISSING } from "./windBins";

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

  it("treats speeds below the calm threshold as calm", () => {
    expect(speedBinIndexMs(CALM_SPEED_MS - 0.01)).toBe(-1);
    expect(parseEpwDataRow("2023,1,1,1,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")?.speedMs).toBe(0.49);
  });

  it("drops EPW missing wind speed and direction codes", () => {
    const missingSpeed = parseEpwDataRow(
      `2023,1,1,1,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,180,${EPW_WIND_SPEED_MISSING},0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0`,
    );
    const missingDir = parseEpwDataRow(
      `2023,1,1,1,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,${EPW_WIND_DIR_MISSING},4.0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0`,
    );
    expect(missingSpeed).toBeNull();
    expect(missingDir).toBeNull();
  });

  it("aggregates winter hours separately from summer", () => {
    const { rows } = parseEpwWindRows(SAMPLE_EPW);
    const winter = aggregateEpwSeason(rows, "winter");
    const summer = aggregateEpwSeason(rows, "summer");
    expect(winter.calmPct).toBeCloseTo(50, 1);
    expect(summer.sectors[0]!.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(winter.prevailingDirDeg).toBe(180);
  });

  it("reads the number of years in the record", () => {
    const line = 'COMMENTS 1,"NCEI ISD/ERA5 - #years=[7] Period of Record=2009-2015; Jan=2015"';
    expect(parseEpwPeriodComment(line)).toEqual({ periodStart: "2009", periodEnd: "2015", years: 7 });
  });

  it("averages non-calm speed per sector", () => {
    const { rows } = parseEpwWindRows(SAMPLE_EPW);
    const winter = aggregateEpwSeason(rows, "winter");
    expect(winter.sectorMeanSpeedMs).toHaveLength(16);
    expect(winter.sectorMeanSpeedMs![8]).toBeCloseTo(4, 6);
    expect(winter.sectorMeanSpeedMs![0]).toBe(0);
  });

  it("keeps the EPW hour and drops rows with an invalid hour", () => {
    const row = parseEpwDataRow("2023,1,1,7,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,180,4.0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
    expect(row).toMatchObject({ month: 1, hour: 7, dirDeg: 180, speedMs: 4 });
    expect(parseEpwDataRow("2023,1,1,0,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,180,4.0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")).toBeNull();
    expect(parseEpwDataRow("2023,1,1,25,0,?9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,180,4.0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")).toBeNull();
  });

  it("filters hours before ranking morning and afternoon, and leaves all-day unchanged", () => {
    const rows = [
      { month: 6, hour: 8, speedMs: 6, dirDeg: 0 },
      { month: 6, hour: 9, speedMs: 5, dirDeg: 0 },
      { month: 6, hour: 11, speedMs: 4, dirDeg: 22 },
      { month: 6, hour: 14, speedMs: 8, dirDeg: 180 },
      { month: 6, hour: 16, speedMs: 7, dirDeg: 180 },
      { month: 6, hour: 21, speedMs: 3, dirDeg: 270 },
    ];
    const allDay = aggregateEpwSeason(rows, "winter");
    const morning = aggregateEpwSeason(rows, "winter", undefined, "morning");
    const afternoon = aggregateEpwSeason(rows, "winter", undefined, "afternoon");
    const packed = aggregateEpwSeasonDayparts(rows, "winter");
    expect(allDay.prevailingDirDeg).toBe(0);
    expect(morning.prevailingDirDeg).toBe(0);
    expect(afternoon.prevailingDirDeg).toBe(180);
    expect(morning.sectors[0]!.reduce((a, b) => a + b, 0)).toBeCloseTo(2 / 3, 5);
    expect(afternoon.sectors[8]!.reduce((a, b) => a + b, 0)).toBe(1);
    expect(afternoon.meanSpeedMs).toBeCloseTo(7.5, 5);
    expect(packed.calmPct).toBe(allDay.calmPct);
    expect(packed.prevailingDirDeg).toBe(allDay.prevailingDirDeg);
    expect(packed.morning?.prevailingDirDeg).toBe(0);
    expect(packed.afternoon?.prevailingDirDeg).toBe(180);
    expect(allDay.sectors[12]!.reduce((a, b) => a + b, 0)).toBeCloseTo(1 / 6, 5);
  });
});
