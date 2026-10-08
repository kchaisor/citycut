import { describe, expect, it } from "vitest";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { assignExternalUses, loadUseTiers } from "./useCascade";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass, findSilentDefaultViolations } from "./buildingHeightSourceTruth";

const CROPS = [
  { lat: -37.8127, lon: 144.98061, km: 1, label: "East Melbourne" },
  { lat: -37.8136, lon: 144.9831, km: 1, label: "second crop" },
];

async function resolveCrop(lat: number, lon: number, km: number) {
  const center = { lon, lat };
  const sideM = km * 1000;
  const bounds = squareBBox(center, sideM);
  const comBounds = paddedComFetchBounds(center, sideM);
  const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
  const { zones } = await loadUseTiers(bounds, center);
  const zoned = assignExternalUses(raw, zones);
  const dam = await fetchDevelopmentFloorRecords(comBounds);
  const withDam = applyDevelopmentFloorsToBuildings(zoned, center, dam);
  const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
  const { buildings: withCom } = applyComBuildingHeights(withDam, footprints);
  return {
    center,
    buildings: applyHeightSourceTruthPass(withCom, center, footprints, dam),
    footprints,
    dam,
  };
}

describe("height source guard (Melbourne census crops)", () => {
  it(
    "has no zone_default buildings while a real source overlaps",
    async () => {
      for (const crop of CROPS) {
        const { center, buildings, footprints, dam } = await resolveCrop(crop.lat, crop.lon, crop.km);
        const violations = findSilentDefaultViolations(buildings, center, footprints, dam);
        expect(violations, `${crop.label} silent defaults: ${JSON.stringify(violations.slice(0, 3))}`).toEqual(
          [],
        );
      }
    },
    180_000,
  );
});
