import { describe, expect, it } from "vitest";
import {
  SHED_MAX_FOOTPRINT_AREA_M2,
  ZONE_FALLBACK_HEIGHT_M,
  fallbackBuildingHeightM,
  zoneFallbackHeightM,
} from "./buildingFallbackHeight";
import { buildingHeight } from "./height";
import { overtureBuildingHeight, overtureHeightUsesFallback, resolveBuildingHeight } from "./overtureHeight";

describe("zone fallback height table", () => {
  it("maps Vicmap zone codes after schedule digits are stripped", () => {
    expect(zoneFallbackHeightM("GRZ1")).toBe(ZONE_FALLBACK_HEIGHT_M.GRZ);
    expect(zoneFallbackHeightM("nrz12")).toBe(6);
    expect(zoneFallbackHeightM("MUZ")).toBe(12);
    expect(zoneFallbackHeightM("ACZ")).toBe(12);
    expect(zoneFallbackHeightM("C1Z")).toBe(8);
    expect(zoneFallbackHeightM("IN3Z")).toBe(8);
    expect(zoneFallbackHeightM("PPRZ")).toBe(6);
    expect(zoneFallbackHeightM("DDO1")).toBeNull();
    expect(zoneFallbackHeightM(null)).toBeNull();
  });
});

describe("fallbackBuildingHeightM", () => {
  it("uses 3 m for small footprints before zone lookup", () => {
    expect(fallbackBuildingHeightM({ footprintAreaM2: SHED_MAX_FOOTPRINT_AREA_M2 - 1, zoneCode: "GRZ1" })).toBe(3);
  });

  it("uses zone height at or above the shed threshold", () => {
    expect(
      fallbackBuildingHeightM({ footprintAreaM2: SHED_MAX_FOOTPRINT_AREA_M2, zoneCode: "GRZ1" }),
    ).toBe(7);
    expect(fallbackBuildingHeightM({ footprintAreaM2: 120, zoneCode: "RGZ" })).toBe(10);
  });

  it("keeps 9 m when the zone is missing or unknown", () => {
    expect(fallbackBuildingHeightM({ footprintAreaM2: 120, zoneCode: null })).toBe(9);
    expect(fallbackBuildingHeightM({ footprintAreaM2: 120, zoneCode: "TRZ2" })).toBe(9);
  });
});

describe("height precedence", () => {
  it("prefers Overture height, then floors, then fallback", () => {
    expect(overtureBuildingHeight({ height: 22 })).toBe(22);
    expect(overtureBuildingHeight({ num_floors: 5 })).toBe(15);
    expect(overtureBuildingHeight({}, { footprintAreaM2: 200, zoneCode: "GRZ1" })).toBe(7);
    expect(overtureHeightUsesFallback({ height: 12 })).toBe(false);
    expect(overtureHeightUsesFallback({ num_floors: 2 })).toBe(false);
    expect(overtureHeightUsesFallback({})).toBe(true);
  });

  it("lets CoM height win over Overture and fallback", () => {
    expect(resolveBuildingHeight({}, 245.5, { footprintAreaM2: 200, zoneCode: "GRZ1" })).toBe(245.5);
  });

  it("matches the OSM tag stack", () => {
    expect(buildingHeight({ height: "12 m" })).toBe(12);
    expect(buildingHeight({ "building:levels": "4" })).toBe(12);
    expect(buildingHeight({ building: "yes" }, { footprintAreaM2: 30 })).toBe(3);
    expect(buildingHeight({ building: "yes" }, { footprintAreaM2: 100, zoneCode: "NRZ" })).toBe(6);
    expect(buildingHeight({ building: "yes" })).toBe(9);
  });
});
