import { describe, expect, it } from "vitest";
import { mgaCrs } from "./crsZone";
import { getColour } from "./colours";
import { qaSchemeMassing } from "./qaSchemeFixture";
import { massingExportParts, massingBuildingPart, visibleMassingBuildings } from "./massingBuildings";
import { massingDrawingBuildings, massingUpperLevelPlanLines } from "./massingFootprint";
import { buildMassingGroup } from "./massingScene";
import { importedMassingShadowCasters, clearPlanShadowCache, planShadowRings } from "./buildingShadows";
import { windObstacleModel } from "./windObstacleModel";
import { planPaths } from "./svgPlan";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { interiorPoint } from "./useCascade";
import type { ImportedMassing } from "./massingImport";
import type { BuildingFeat, CityModel } from "../types";

const origin = { lon: 144.9645, lat: -37.8216 };
const zone = mgaCrs(origin.lon).zone;
const ALL = ["Tower A Residential", "Podium", "Tower B"];
const WITHOUT_PODIUM = ["Tower A Residential", "Tower B"];

function scheme(): ImportedMassing {
  return qaSchemeMassing(origin, zone, 0);
}

function hide(massing: ImportedMassing, name: string): ImportedMassing {
  return {
    ...massing,
    buildings: massing.buildings.map((building) => (building.name === name ? { ...building, visible: false } : building)),
  };
}

function names(buildings: BuildingFeat[]): string[] {
  return [...new Set(buildings.map((building) => building.overtureName!))];
}

function footprints(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.filter((building) => !building.importedMassingShadowCaster);
}

function model(buildings: BuildingFeat[], massing: ImportedMassing[] = []): CityModel {
  return {
    placeLabel: "Southbank",
    center: origin,
    sideM: 500,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    importedMassingUpperLevels: massingUpperLevelPlanLines(massing, origin, zone),
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

describe("one building per part", () => {
  it("slices each building to its own vertices and triangles", () => {
    const massing = scheme();
    for (const building of massing.buildings) {
      const part = massingBuildingPart(massing, building);
      expect(part.positions.length / 3).toBe(building.vertexEnd - building.vertexStart);
      expect(part.triangles).toBe(building.triEnd - building.triStart);
      expect(Math.max(...part.indices)).toBeLessThan(part.positions.length / 3);
      expect(part.partTriangleStarts[0]).toBe(0);
      expect(part.partTriangleStarts.at(-1)).toBe(part.triangles);
    }
  });

  it("drops every building of a hidden file", () => {
    expect(visibleMassingBuildings([{ ...scheme(), visible: false }])).toEqual([]);
  });
});

describe("hiding one of three imported buildings", () => {
  it("3D: draws one mesh per visible building, tagged for picking", () => {
    const meshes = (massing: ImportedMassing) =>
      buildMassingGroup([massing], origin, zone)!.children.filter((child) => (child as { isMesh?: boolean }).isMesh);
    expect(meshes(scheme()).map((mesh) => mesh.name)).toEqual(ALL);
    const shown = meshes(hide(scheme(), "Podium"));
    expect(shown.map((mesh) => mesh.name)).toEqual(WITHOUT_PODIUM);
    expect(shown.map((mesh) => mesh.userData.importedBuildingId)).toEqual([
      "layer:Scheme A::Tower A Residential",
      "text:Tower B",
    ]);
    expect(shown.every((mesh) => mesh.userData.importedMassingId === "qa-scheme")).toBe(true);
  });

  it("Drawing: one footprint per building, minus the hidden one", () => {
    expect(names(footprints(massingDrawingBuildings([scheme()], origin, zone)))).toEqual(ALL);
    const plan = footprints(massingDrawingBuildings([hide(scheme(), "Podium")], origin, zone));
    expect(plan).toHaveLength(2);
    expect(names(plan)).toEqual(WITHOUT_PODIUM);
    expect(plan.map((building) => building.importedBuilding?.buildingId)).toEqual([
      "layer:Scheme A::Tower A Residential",
      "text:Tower B",
    ]);
  });

  it("shadows: casters and plan shadows leave out the hidden building", () => {
    const all = massingDrawingBuildings([scheme()], origin, zone);
    const hidden = massingDrawingBuildings([hide(scheme(), "Podium")], origin, zone);
    expect(names(importedMassingShadowCasters(all))).toEqual(ALL);
    expect(names(importedMassingShadowCasters(hidden))).toEqual(WITHOUT_PODIUM);
    const at = { lat: origin.lat, lon: origin.lon, year: 2026, month: 6, day: 21, hour: 12, minute: 0 };
    clearPlanShadowCache();
    const allRings = planShadowRings(model(all), at, true).length;
    clearPlanShadowCache();
    const hiddenRings = planShadowRings(model(hidden), at, true).length;
    expect(hiddenRings).toBeGreaterThan(0);
    expect(hiddenRings).toBeLessThanOrEqual(allRings);
  });

  it("wind: obstacles come from the visible buildings only", () => {
    const hidden = massingDrawingBuildings([hide(scheme(), "Podium")], origin, zone);
    const wind = windObstacleModel(model([]), hidden);
    expect(names(wind.buildings)).toEqual(WITHOUT_PODIUM);
  });

  it("plan export: the site plan paths carry two imported footprints", () => {
    const hidden = hide(scheme(), "Podium");
    const plan = planPaths(model(massingDrawingBuildings([hidden], origin, zone), [hidden]));
    expect(plan.buildings.filter((building) => building.imported)).toHaveLength(2);
  });

  it(".3dm export: one named object per visible building", async () => {
    const parts = massingExportParts([hide(scheme(), "Podium")]);
    expect(parts.map((part) => part.name)).toEqual(WITHOUT_PODIUM);
    const bytes = await cityModelTo3dm(model([]), { importedMassing: parts });
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const objectNames: string[] = [];
      const objects = doc.objects();
      for (let i = 0; i < objects.count; i++) objectNames.push(objects.get(i).attributes().name);
      expect(objectNames.filter((name) => ALL.includes(name)).sort()).toEqual(WITHOUT_PODIUM);
    } finally {
      doc.destroy();
    }
  });
});

describe("imported building colours", () => {
  it("By use: use colour per building, unclassified grey with no use", () => {
    const plan = footprints(massingDrawingBuildings([scheme()], origin, zone));
    expect(plan.map((building) => building.importedColour)).toEqual([
      getColour("--use-residential"),
      getColour("--use-unclassified"),
      getColour("--use-commercial"),
    ]);
  });

  it("Single colour: the file colour overrides use colours on every building", () => {
    const plan = footprints(massingDrawingBuildings([{ ...scheme(), colour: "#3366CC" }], origin, zone));
    expect(plan.map((building) => building.importedColour)).toEqual(["#3366CC", "#3366CC", "#3366CC"]);
    expect(massingExportParts([{ ...scheme(), colour: "#3366CC" }]).every((part) => part.colour === "#3366CC")).toBe(true);
  });
});

describe("placement moves the file together", () => {
  it("moving and rotating moves all three footprints by the same rigid transform", () => {
    const before = scheme();
    const after = { ...before, placement: { ...before.placement, e: before.placement.e + 10, n: before.placement.n - 5, rotDeg: 90 } };
    const centres = (massing: ImportedMassing) =>
      footprints(massingDrawingBuildings([massing], origin, zone)).map((building) =>
        interiorPoint(building.ring, building.holes),
      );
    const a = centres(before);
    const b = centres(after);
    expect(b).toHaveLength(3);
    const rotated = (p: [number, number], q: [number, number]) => [-(p[1] - q[1]), p[0] - q[0]];
    const da = rotated(a[2] as [number, number], a[0] as [number, number]);
    expect(b[2]![0] - b[0]![0]).toBeCloseTo(da[0]!, 0);
    expect(b[2]![1] - b[0]![1]).toBeCloseTo(da[1]!, 0);
    const moved = footprints(
      massingDrawingBuildings([{ ...before, placement: { ...before.placement, e: before.placement.e + 10 } }], origin, zone),
    ).map((building) => interiorPoint(building.ring, building.holes));
    moved.forEach((point, index) => expect(point[0] - a[index]![0]).toBeCloseTo(10, 0));
  });
});
