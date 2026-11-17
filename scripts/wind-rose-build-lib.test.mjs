import { describe, expect, it } from "vitest";
import {
  aggregateEpwSeason,
  chooseLongestUsableRecord,
  compactSeasonRecord,
  orderTmyxCandidates,
  parseEpwPeriodComment,
} from "./wind-rose-build-lib.mjs";

const RIVERVIEW_FULL = "AUS_NSW_Riverview.Observatory.957640_TMYx.zip";
const RIVERVIEW_2009 = "AUS_NSW_Riverview.Observatory.957640_TMYx.2009-2023.zip";
const RIVERVIEW_2011 = "AUS_NSW_Riverview.Observatory.957640_TMYx.2011-2025.zip";

describe("parseEpwPeriodComment", () => {
  it("reads the number of years alongside the period of record", () => {
    const line =
      'COMMENTS 1,"NCEI ISD/ERA5 - #years=[19] Period of Record=1997-2015; Jan=2005; Feb=1997"';
    expect(parseEpwPeriodComment(line)).toEqual({ periodStart: "1997", periodEnd: "2015", years: 19 });
  });

  it("leaves years unknown when the header has no count", () => {
    expect(parseEpwPeriodComment('COMMENTS 1,"Period of Record=2009-2023"')?.years).toBeNull();
  });
});

describe("orderTmyxCandidates", () => {
  it("puts the full-record zip first, then dated windows by latest end year", () => {
    const names = [
      `NSW/${RIVERVIEW_2009}`,
      "NSW/AUS_NSW_Riverview.Observatory.957640_TMYx.2007-2021.zip",
      `NSW/${RIVERVIEW_FULL}`,
      `NSW/${RIVERVIEW_2011}`,
    ];
    expect(orderTmyxCandidates(names)).toEqual([
      `NSW/${RIVERVIEW_FULL}`,
      `NSW/${RIVERVIEW_2011}`,
      `NSW/${RIVERVIEW_2009}`,
      "NSW/AUS_NSW_Riverview.Observatory.957640_TMYx.2007-2021.zip",
    ]);
  });
});

describe("chooseLongestUsableRecord", () => {
  it("picks the 19-year Riverview record over the 7-year 2009-2023 file", () => {
    const pick = chooseLongestUsableRecord([
      { zipName: RIVERVIEW_2009, years: 7, periodStart: "2009", periodEnd: "2015", sane: true },
      { zipName: RIVERVIEW_FULL, years: 19, periodStart: "1997", periodEnd: "2015", sane: true },
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_FULL);
  });

  it("falls back to a shorter sane record when the longest fails the calm caps", () => {
    const pick = chooseLongestUsableRecord([
      { zipName: RIVERVIEW_FULL, years: 40, periodStart: "1980", periodEnd: "2023", sane: false },
      { zipName: RIVERVIEW_2009, years: 15, periodStart: "2009", periodEnd: "2023", sane: true },
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_2009);
  });

  it("keeps the longest record when none pass the calm caps", () => {
    const pick = chooseLongestUsableRecord([
      { zipName: RIVERVIEW_2009, years: 15, periodStart: "2009", periodEnd: "2023", sane: false },
      { zipName: RIVERVIEW_FULL, years: 40, periodStart: "1980", periodEnd: "2023", sane: false },
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_FULL);
  });

  it("breaks a tie in years on the later period end", () => {
    const pick = chooseLongestUsableRecord([
      { zipName: RIVERVIEW_2009, years: 15, periodStart: "2009", periodEnd: "2023", sane: true },
      { zipName: RIVERVIEW_2011, years: 15, periodStart: "2011", periodEnd: "2025", sane: true },
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_2011);
  });

  it("returns null with no candidates", () => {
    expect(chooseLongestUsableRecord([])).toBeNull();
  });
});

describe("sector mean speeds", () => {
  it("averages non-calm hours per sector and leaves empty sectors at 0", () => {
    const rows = [
      { month: 6, speedMs: 4, dirDeg: 180 },
      { month: 6, speedMs: 6, dirDeg: 185 },
      { month: 6, speedMs: 0.1, dirDeg: 0 },
      { month: 7, speedMs: 3, dirDeg: 90 },
    ];
    const winter = aggregateEpwSeason(rows, "winter");
    expect(winter.sectorMeanSpeedMs).toHaveLength(16);
    expect(winter.sectorMeanSpeedMs[8]).toBeCloseTo(5, 6);
    expect(winter.sectorMeanSpeedMs[4]).toBeCloseTo(3, 6);
    expect(winter.sectorMeanSpeedMs[0]).toBe(0);
  });

  it("rounds sector speeds to 2 decimals and frequencies to 5 significant digits", () => {
    const compact = compactSeasonRecord({
      calmPct: 1,
      prevailingDirDeg: 0,
      meanSpeedMs: 3,
      sectors: [[0.0161, 0.031735159817351595, 0]],
      sectorMeanSpeedMs: [4.23456, 0],
    });
    expect(compact.sectors[0]).toEqual([0.0161, 0.031735, 0]);
    expect(compact.sectorMeanSpeedMs).toEqual([4.23, 0]);
  });
});
