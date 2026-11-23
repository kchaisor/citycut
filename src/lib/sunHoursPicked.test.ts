import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildFacadeOcclusionMesh } from "./facadeOcclusionMesh";
import { assessDirectSunHoursOverlay, type SunHoursDirectOverlay } from "./sunHoursDirectAssess";
import { buildCityGroup } from "./buildCity";
import { mountSelectedBuildingsVisual } from "./buildingSelectionVisual";
import { hidePickedMassingForSunHours, setSunHoursMassingFillVisible } from "./sunHoursFaceTint";
import { sunHoursDirectRgb } from "./sunHoursGround";
import {
  sunHoursFacesReplaceMassing,
  sunHoursGroundShown,
  sunHoursOverlayForBuildings,
  sunHoursSelectionVisualIds,
  sunHoursRoofRasterSourceForBuildings,
  type SunHoursFaceRange,
} from "./sunHoursPicked";
import { sunHoursPlanLayers } from "./sunHoursPlanLayers";
import { FAST_SUN_HOURS_PARAMS } from "./sunHoursQuality";
import { SUN_HOURS_FIXED_WINDOW_HOURS } from "./sunHoursWindow";
import type { SunHoursGroundGrid } from "./sunHoursGroundPlan";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };
const LOW = 1;
const TOWER = 2;

function box(id: number, east: number, north: number, size: number, height: number): BuildingFeat {
  return {
    id,
    ring: [
      [east, north],
      [east + size, north],
      [east + size, north + size],
      [east, north + size],
      [east, north],
    ],
    holes: [],
    height,
    use: "residential",
    source: "none",
  };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM: 120,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

const pickedColourMode = { colourByUse: false, uniformBuildings: true, colourBySource: false };
const low = box(LOW, -9, -20, 18, 6);
const tower = box(TOWER, -15, 2, 30, 90);

function study(buildings: BuildingFeat[]): SunHoursDirectOverlay {
  return assessDirectSunHoursOverlay(
    model(buildings),
    2026,
    6,
    21,
    SUN_HOURS_FIXED_WINDOW_HOURS,
    FAST_SUN_HOURS_PARAMS,
    undefined,
    "9to3",
  )!;
}

function vertices(ranges: readonly SunHoursFaceRange[], buildingId: number): number {
  return ranges.filter((range) => range.buildingId === buildingId).reduce((sum, range) => sum + range.count, 0);
}

function slice(values: Float32Array, ranges: readonly SunHoursFaceRange[], buildingId: number): number[] {
  const out: number[] = [];
  for (const range of ranges) {
    if (range.buildingId !== buildingId) continue;
    out.push(...values.subarray(range.start * 3, (range.start + range.count) * 3));
  }
  return out;
}

describe("Colour only selected buildings", () => {
  const overlay = study([low, tower]);

  it("records which roof and wall faces belong to which building", () => {
    for (const id of [LOW, TOWER]) {
      expect(vertices(overlay.roofRanges, id)).toBeGreaterThan(0);
      expect(vertices(overlay.wallRanges, id)).toBeGreaterThan(0);
    }
    expect(vertices(overlay.roofRanges, LOW) + vertices(overlay.roofRanges, TOWER)).toBe(overlay.roofPositions.length / 3);
    expect(vertices(overlay.wallRanges, LOW) + vertices(overlay.wallRanges, TOWER)).toBe(overlay.wallPositions.length / 3);
  });

  it("colours only the picked building's roofs and walls", () => {
    const picked = sunHoursOverlayForBuildings(overlay, [LOW]);
    expect(picked.roofRanges.map((range) => range.buildingId)).toEqual([LOW]);
    expect(picked.wallRanges.map((range) => range.buildingId)).toEqual([LOW]);
    expect(picked.roofPositions.length / 3).toBe(vertices(overlay.roofRanges, LOW));
    expect(picked.wallPositions.length / 3).toBe(vertices(overlay.wallRanges, LOW));
    expect([...picked.roofPositions]).toEqual(slice(overlay.roofPositions, overlay.roofRanges, LOW));
    expect([...picked.roofColors]).toEqual(slice(overlay.roofColors, overlay.roofRanges, LOW));
    expect([...picked.wallColors]).toEqual(slice(overlay.wallColors, overlay.wallRanges, LOW));
    expect(picked.positions).toBe(picked.wallPositions);
    expect(picked.maxSunHours).toBe(overlay.maxSunHours);
  });

  it("adds buildings to the pick and colours nothing when none is picked", () => {
    const both = sunHoursOverlayForBuildings(overlay, [TOWER, LOW]);
    expect(both.roofPositions.length).toBe(overlay.roofPositions.length);
    expect(both.wallPositions.length).toBe(overlay.wallPositions.length);
    const none = sunHoursOverlayForBuildings(overlay, []);
    expect(none.roofPositions).toHaveLength(0);
    expect(none.wallPositions).toHaveLength(0);
    expect(sunHoursOverlayForBuildings(overlay, [999]).wallPositions).toHaveLength(0);
  });

  it("keeps unselected buildings in the occlusion mesh, so they still shade the picked building", () => {
    const occluders = buildFacadeOcclusionMesh(model([low, tower]))!;
    const alone = buildFacadeOcclusionMesh(model([low]))!;
    expect(occluders.geometry.getAttribute("position").count).toBeGreaterThan(alone.geometry.getAttribute("position").count);

    const lit = sunHoursDirectRgb(SUN_HOURS_FIXED_WINDOW_HOURS, SUN_HOURS_FIXED_WINDOW_HOURS);
    const unshaded = sunHoursOverlayForBuildings(study([low]), [LOW]);
    const shaded = sunHoursOverlayForBuildings(overlay, [LOW]);
    const fullyLit = (colors: Float32Array) => {
      for (let index = 0; index < colors.length; index += 3) {
        if (
          Math.abs(colors[index]! - lit[0]) > 1e-6 ||
          Math.abs(colors[index + 1]! - lit[1]) > 1e-6 ||
          Math.abs(colors[index + 2]! - lit[2]) > 1e-6
        ) {
          return false;
        }
      }
      return true;
    };
    expect(fullyLit(unshaded.roofColors)).toBe(true);
    expect(fullyLit(shaded.roofColors)).toBe(false);
  });

  it("leaves the ordinary massing on and the ground uncoloured while only picked buildings are coloured", () => {
    expect(sunHoursFacesReplaceMassing(true, false)).toBe(true);
    expect(sunHoursFacesReplaceMassing(true, true)).toBe(false);
    expect(sunHoursFacesReplaceMassing(false, false)).toBe(false);
    expect(sunHoursGroundShown(true, false)).toBe(true);
    expect(sunHoursGroundShown(true, true)).toBe(false);
    expect(sunHoursGroundShown(false, false)).toBe(false);

    const city = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    fill.name = "Buildings";
    city.add(fill);
    setSunHoursMassingFillVisible(city, null, true, true, sunHoursFacesReplaceMassing(true, true));
    expect(fill.visible).toBe(true);
    setSunHoursMassingFillVisible(city, null, true, true, sunHoursFacesReplaceMassing(true, false));
    expect(fill.visible).toBe(false);
  });

  it("drops selection chrome and hides only the picked fill when Colour only selected is on", () => {
    const city = model([low, tower]);
    const group = buildCityGroup(city);
    const visibleFill = () => {
      const ids = new Set<number>();
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.name.startsWith("Buildings")) return;
        const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
        const groups = mesh.geometry.groups;
        if (mesh.userData.buildingId != null) {
          if (mesh.visible) ids.add(Number(mesh.userData.buildingId));
          return;
        }
        byGroup?.forEach((id, index) => {
          if (mesh.visible && groups[index]!.count > 0) ids.add(Number(id));
        });
      });
      return ids;
    };
    expect(visibleFill()).toEqual(new Set([LOW, TOWER]));
    let edgesVisible = false;
    group.traverse((object) => {
      if (object.name === "BuildingEdges") edgesVisible = object.visible;
    });

    expect(sunHoursSelectionVisualIds(true, [TOWER])).toEqual([]);
    expect(mountSelectedBuildingsVisual(group, city, sunHoursSelectionVisualIds(true, [TOWER]), pickedColourMode)).toBeNull();
    expect(visibleFill()).toEqual(new Set([LOW, TOWER]));

    const restore = hidePickedMassingForSunHours([group, null], [TOWER]);
    expect(visibleFill()).toEqual(new Set([LOW]));
    group.traverse((object) => {
      if (object.name === "BuildingEdges") expect(object.visible).toBe(edgesVisible);
    });
    restore();
    expect(visibleFill()).toEqual(new Set([LOW, TOWER]));

    expect(sunHoursSelectionVisualIds(false, [TOWER])).toEqual([TOWER]);
    const selection = mountSelectedBuildingsVisual(group, city, sunHoursSelectionVisualIds(false, [TOWER]), pickedColourMode);
    expect(selection).not.toBeNull();
    expect(selection!.overlayOpacity).toBeLessThan(1);
    expect(visibleFill()).toEqual(new Set([LOW]));
    selection!.restore();
  });

  it("hides the plan ground raster and keeps only picked roofs on the site plan", () => {
    const grid = { maxSunHours: 6 } as SunHoursGroundGrid;
    const result = { grid, overlay, scaleMaxHours: 6 };
    const all = sunHoursPlanLayers(model([low, tower]), result, false, []);
    expect(all.grid).toBe(grid);
    expect(all.roofPlanRaster).toBe(overlay.roofPlanRaster);
    const picked = sunHoursPlanLayers(model([low, tower]), result, true, []);
    expect(picked.grid).toBeNull();
    expect(picked.roofPlanRaster).toBeNull();
    expect(picked.scaleMaxHours).toBe(6);

    const source = overlay.roofRasterSource!;
    expect(new Set(source.buildingIds)).toEqual(new Set([LOW, TOWER]));
    const lowOnly = sunHoursRoofRasterSourceForBuildings(source, [LOW])!;
    expect(new Set(lowOnly.buildingIds)).toEqual(new Set([LOW]));
    expect(lowOnly.hours.length).toBe(source.buildingIds.filter((id) => id === LOW).length);
    expect(sunHoursRoofRasterSourceForBuildings(source, [])).toBeNull();
  });
});
