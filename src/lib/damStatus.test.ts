import { describe, expect, it } from "vitest";
import { inferHeightTier } from "./buildingHeightResolve";
import { resolveBuildingHeightsAfterCom } from "./buildingHeightPipeline";
import {
  applyDevelopmentFloorsToBuildings,
  damRecordGivesHeight,
  heightBearingDamRecords,
  type DamFloorRecord,
} from "./comDevelopmentFloors";
import type { BuildingFeat, Ring } from "../types";

const center = { lon: 144.98061, lat: -37.8127 };
const at = (floorsAbove: number, status?: string): DamFloorRecord =>
  status == null ? { ...center, floorsAbove } : { ...center, floorsAbove, status };
const sq: Ring = [
  [-15, -15],
  [15, -15],
  [15, 15],
  [-15, 15],
  [-15, -15],
];
/** Overture building with an explicit height tag, DAM geopoint inside its footprint. */
const overture = (): BuildingFeat => ({
  id: 1,
  ring: sq,
  holes: [],
  height: 15,
  heightTier: "overture_height",
  use: "commercial",
  source: "overture_class",
});
/** Zone-default building, DAM geopoint inside its footprint. */
const zoneDefault = (): BuildingFeat => ({
  id: 2,
  ring: sq,
  holes: [],
  height: 9,
  heightFromFallback: true,
  use: "commercial",
  source: "zone",
});

describe("DAM floors apply only when the DAM record is COMPLETED (Kelvin, #84)", () => {
  it("lists the four published statuses and accepts only COMPLETED", () => {
    expect(damRecordGivesHeight(at(10, "COMPLETED"))).toBe(true);
    expect(damRecordGivesHeight(at(10, " completed "))).toBe(true);
    for (const status of ["UNDER CONSTRUCTION", "APPROVED", "APPLIED", "", "WITHDRAWN"]) {
      expect(damRecordGivesHeight(at(10, status))).toBe(false);
    }
    expect(damRecordGivesHeight(at(10))).toBe(false);
  });

  it("under construction DAM record + Overture height: Overture wins", () => {
    const [out] = resolveBuildingHeightsAfterCom([overture()], center, [], [at(40, "UNDER CONSTRUCTION")]);
    expect(out.height).toBe(15);
    expect(inferHeightTier(out)).toBe("overture_height");
    expect(out.developmentFloors).toBeUndefined();
  });

  it("approved / applied / missing-status DAM record + Overture height: Overture wins", () => {
    for (const record of [at(40, "APPROVED"), at(40, "APPLIED"), at(40)]) {
      const [out] = resolveBuildingHeightsAfterCom([overture()], center, [], [record]);
      expect(out.height).toBe(15);
      expect(inferHeightTier(out)).toBe("overture_height");
    }
  });

  it("completed DAM record + Overture height: DAM wins", () => {
    const [out] = resolveBuildingHeightsAfterCom([overture()], center, [], [at(10, "COMPLETED")]);
    expect(out.height).toBe(30);
    expect(inferHeightTier(out)).toBe("development_floors");
    expect(out.developmentFloors).toBe(10);
  });

  it("under construction DAM record on a zone default: stays a plain labelled estimate, not 'real source did not apply'", () => {
    const [out] = resolveBuildingHeightsAfterCom([zoneDefault()], center, [], [at(40, "UNDER CONSTRUCTION")]);
    expect(out.height).toBe(9);
    expect(inferHeightTier(out)).toBe("zone_default");
    expect(out.zoneDefaultNote ?? "").not.toMatch(/DAM/);
  });

  it("a completed record still wins when an under-construction one sits at the same point", () => {
    const records = [at(40, "UNDER CONSTRUCTION"), at(10, "COMPLETED")];
    expect(heightBearingDamRecords(records)).toHaveLength(1);
    const [out] = applyDevelopmentFloorsToBuildings([overture()], center, records);
    expect(out.height).toBe(30);
  });
});
