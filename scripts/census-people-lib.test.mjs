import { describe, expect, it } from "vitest";
import {
  CENSUS_FIELDS,
  cellNumber,
  encodeRing,
  extractMetrics,
  groupShpRings,
  parseCsv,
  ringSignedArea,
  simplifyRing,
} from "./census-people-lib.mjs";

describe("census CSV parsing", () => {
  it("parses rows keyed by region code and treats suppressed cells as 0", () => {
    const rows = parseCsv("SA1_CODE_2021,Tot_P_P,Median_age_persons\r\n20601,123,..\r\n20602,4,35\r\n");
    expect(rows.get("20601")).toEqual({ Tot_P_P: 123, Median_age_persons: 0 });
    expect(rows.get("20602").Median_age_persons).toBe(35);
    expect(cellNumber(" 7 ")).toBe(7);
    expect(cellNumber("-")).toBe(0);
    expect(cellNumber(undefined)).toBe(0);
  });

  it("extracts metrics in field order with derived groups", () => {
    const values = extractMetrics({
      G01: { Tot_P_P: 100, Age_0_4_yr_P: 5, Age_5_14_yr_P: 10, Age_65_74_yr_P: 3, Age_75_84_yr_P: 2, Age_85ov_P: 1 },
      G02: { Median_age_persons: 34, Median_tot_hhd_inc_weekly: 1900 },
      G35: { Total_FamHhold: 20, Total_NonFamHhold: 15, Num_Psns_UR_1_NonFamHhold: 10 },
      G37: { Total_Total: 50, O_OR_Total: 10, O_MTG_Total: 15, R_Tot_Total: 20, Ten_type_NS_Total: 2 },
    });
    const at = (key) => values[CENSUS_FIELDS.indexOf(key)];
    expect(values).toHaveLength(CENSUS_FIELDS.length);
    expect(at("pop")).toBe(100);
    expect(at("a0_14")).toBe(15);
    expect(at("a65p")).toBe(6);
    expect(at("medHhInc")).toBe(1900);
    expect(at("hhLone")).toBe(10);
    expect(at("hhGroup")).toBe(5);
    expect(at("tenOther")).toBe(3);
    expect(at("twCar")).toBe(0);
  });
});

describe("census geometry", () => {
  const square = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];

  it("groups clockwise shapefile rings as outers and counter-clockwise as holes", () => {
    expect(ringSignedArea(square)).toBeLessThan(0);
    const hole = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]];
    const other = [[5, 5], [5, 6], [6, 6], [6, 5], [5, 5]];
    const polygons = groupShpRings([square, hole, other]);
    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveLength(2);
  });

  it("simplifies collinear points and delta-encodes at 1e5", () => {
    const line = [[0, 0], [0, 0.5], [0, 1], [1, 1], [1, 0], [0, 0]];
    expect(simplifyRing(line, 0.001).length).toBeLessThan(line.length);
    expect(encodeRing([[144.98, -37.8], [144.98001, -37.8]])).toEqual([14498000, -3780000, 1, 0]);
  });
});
