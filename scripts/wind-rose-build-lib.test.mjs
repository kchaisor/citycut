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

const calm = (annual, summer = annual, autumn = annual, winter = annual, spring = annual) => ({
  annual: { calmPct: annual },
  summer: { calmPct: summer },
  autumn: { calmPct: autumn },
  winter: { calmPct: winter },
  spring: { calmPct: spring },
});
const record = (zipName, years, periodStart, periodEnd, seasons, sane = true) => ({
  zipName,
  years,
  periodStart,
  periodEnd,
  seasons,
  sane,
});

describe("chooseLongestUsableRecord", () => {
  it("picks the 19-year Riverview record over the 7-year 2009-2023 file", () => {
    const pick = chooseLongestUsableRecord([
      record(RIVERVIEW_2009, 7, "2009", "2015", calm(1)),
      record(RIVERVIEW_FULL, 19, "1997", "2015", calm(1)),
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_FULL);
  });

  it("falls back to a shorter sane record when the longest fails the calm caps", () => {
    const pick = chooseLongestUsableRecord([
      record(RIVERVIEW_FULL, 40, "1980", "2023", calm(40), false),
      record(RIVERVIEW_2009, 15, "2009", "2023", calm(1)),
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_2009);
  });

  it("keeps the longest record when none pass the calm caps", () => {
    const pick = chooseLongestUsableRecord([
      record(RIVERVIEW_2009, 15, "2009", "2023", calm(60), false),
      record(RIVERVIEW_FULL, 40, "1980", "2023", calm(60), false),
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_FULL);
  });

  it("breaks a tie in years on the later period end", () => {
    const pick = chooseLongestUsableRecord([
      record(RIVERVIEW_2009, 15, "2009", "2023", calm(1)),
      record(RIVERVIEW_2011, 15, "2011", "2025", calm(1)),
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_2011);
  });

  it("returns null with no candidates", () => {
    expect(chooseLongestUsableRecord([])).toBeNull();
  });

  it("skips a Sydney Airport-like full record whose calm looks gappy and takes 2011-2025", () => {
    const airport = "AUS_NSW_Sydney.Intl.AP.947670";
    const pick = chooseLongestUsableRecord([
      record(`${airport}_TMYx.zip`, 82, "1940", "2025", calm(10.8, 16.8, 9, 20.2, 6)),
      record(`${airport}_TMYx.2004-2018.zip`, 15, "2004", "2018", calm(1.6, 1.2, 1.5, 2.4, 1.1)),
      record(`${airport}_TMYx.2009-2023.zip`, 15, "2009", "2023", calm(1.7, 1.0, 1.8, 2.7, 0.9)),
      record(`${airport}_TMYx.2011-2025.zip`, 15, "2011", "2025", calm(1.8, 1.1, 1.9, 2.6, 1.0)),
    ]);
    expect(pick?.zipName).toBe(`${airport}_TMYx.2011-2025.zip`);
  });

  it("rejects a long record that is more than 5 points calmer in a single season", () => {
    const pick = chooseLongestUsableRecord([
      record(RIVERVIEW_FULL, 19, "1997", "2015", calm(3, 3, 3, 8.1, 3)),
      record(RIVERVIEW_2011, 15, "2011", "2025", calm(3)),
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_2011);
  });

  it("keeps Riverview's full record when its calm matches the recent file", () => {
    const pick = chooseLongestUsableRecord([
      record(RIVERVIEW_FULL, 19, "1997", "2015", calm(1.0)),
      record(RIVERVIEW_2011, 15, "2011", "2025", calm(1.0)),
    ]);
    expect(pick?.zipName).toBe(RIVERVIEW_FULL);
  });

  it("keeps Observatory Hill's full record when its recent file is itself mostly calm", () => {
    const obs = "AUS_NSW_Sydney.Observatory.Hill.947680";
    const pick = chooseLongestUsableRecord([
      record(`${obs}_TMYx.zip`, 64, "1954", "2025", calm(6.7, 7, 6, 5.4, 7)),
      record(`${obs}_TMYx.2011-2025.zip`, 15, "2011", "2025", calm(67, 60, 70, 99.9, 50), false),
    ]);
    expect(pick?.zipName).toBe(`${obs}_TMYx.zip`);
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
