import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyComBuildingHeights } from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings } from "./comDevelopmentFloors";
import { buildingHeightSourceLabelForBuilding } from "./heightOverrides";
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

    const withDam = applyDevelopmentFloorsToBuildings([building], center, damRecords)[0]!;
    expect(withDam.height).toBeGreaterThanOrEqual(15);
    expect(withDam.height).toBeLessThanOrEqual(30);
    expect(inferHeightTier(withDam)).toBe("development_floors");

    const { buildings: withCom } = applyComBuildingHeights([building], comFootprints);
    const com = withCom[0]!;
    expect(com.height).toBeGreaterThanOrEqual(15);
    expect(com.height).toBeLessThanOrEqual(30);
    expect(inferHeightTier(com)).toBe("com");
    expect(buildingHeightSourceLabelForBuilding(com)).not.toMatch(/^Zone default/);
  });
});
