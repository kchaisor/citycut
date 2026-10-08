import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyComBuildingHeights } from "./comBuildingHeights";
import {
  applyDevelopmentFloorsToBuildings,
  damRecordsWonByBuilding,
  buildingContainsDamGeopoint,
} from "./comDevelopmentFloors";
import { buildingHeightSourceLabelForBuilding } from "./heightOverrides";
import { tallestExtrusionHeight } from "./comBuildingHeightsMatch";
import { inferHeightTier } from "./buildingHeightResolve";
import type { BuildingFeat } from "../types";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { DamFloorRecord } from "./comDevelopmentFloors";

type Fixture = {
  center: { lon: number; lat: number };
  building: BuildingFeat;
  comFootprints: ComBuildingFootprint[];
  damRecords: DamFloorRecord[];
};

function loadFixture(): Fixture {
  const path = fileURLToPath(new URL("./fixtures/freemasons-hospital-height.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Fixture;
}

describe("Freemasons Hospital height regression (East Melbourne)", () => {
  it("resolves to CoM or development height in 15–30 m, not zone default", () => {
    const { center, building, comFootprints, damRecords } = loadFixture();
    expect(building.heightFromFallback).toBe(true);
    expect(building.height).toBe(6);

    const { buildings: withCom } = applyComBuildingHeights([building], comFootprints);
    const com = withCom[0]!;
    expect(com.extrusionParts?.some((p) => p.height === 27.7)).toBe(true);
    expect(com.height).toBeCloseTo(tallestExtrusionHeight(com), 2);
    expect(com.height).toBeGreaterThanOrEqual(27.7);
    expect(inferHeightTier(com)).toBe("com");
    expect(com.extrusionParts?.length ?? 0).toBeGreaterThan(1);
    expect(com.comMatchStructureId).toBe("811239");
    expect(buildingHeightSourceLabelForBuilding(com)).toMatch(/City of Melbourne/);

    const hospitalDam = damRecords.filter((r) => buildingContainsDamGeopoint(building, center, r));
    expect(hospitalDam.length).toBeGreaterThan(0);
    const parkStub: BuildingFeat = {
      id: 2809555828,
      ring: [
        [400, 400],
        [420, 400],
        [420, 420],
        [400, 420],
        [400, 400],
      ],
      holes: [],
      height: 3,
      heightFromFallback: true,
      use: "recreation",
      source: "zone",
    };
    for (const record of hospitalDam) {
      expect(damRecordsWonByBuilding(parkStub, center, [record], [building, parkStub]).length).toBe(0);
      expect(damRecordsWonByBuilding(building, center, [record], [building, parkStub]).length).toBe(1);
    }

    const withDamAfterCom = applyDevelopmentFloorsToBuildings(withCom, center, damRecords)[0]!;
    expect(inferHeightTier(withDamAfterCom)).toBe("com");
    expect(withDamAfterCom.height).toBe(com.height);
  });
});
