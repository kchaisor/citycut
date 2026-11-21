import { describe, expect, it } from "vitest";
import { mgaCrs } from "./crsZone";
import { qaSchemeMassing } from "./qaSchemeFixture";
import { massingDrawingBuildings } from "./massingFootprint";
import { buildFacadeOcclusionMesh } from "./facadeOcclusionMesh";
import { directSunHoursSamplesForModel } from "./sunHoursDirectSample";
import { buildRoofFootprintMeshesForModel } from "./sunHoursRoofFootprint";
import { castsSunHoursShadow, receivesSunHours, sunHoursModel } from "./sunHoursBuildings";
import type { ImportedMassing } from "./massingImport";
import type { BuildingFeat, CityModel } from "../types";

const origin = { lon: 144.9645, lat: -37.8216 };
const zone = mgaCrs(origin.lon).zone;

function hide(massing: ImportedMassing, name: string): ImportedMassing {
  return {
    ...massing,
    buildings: massing.buildings.map((building) => (building.name === name ? { ...building, visible: false } : building)),
  };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Southbank",
    center: origin,
    sideM: 500,
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

function sampledNames(buildings: BuildingFeat[]): string[] {
  const samples = directSunHoursSamplesForModel(model(buildings));
  const byId = new Map(buildings.map((building) => [building.id, building.overtureName!]));
  return [...new Set(samples.map((sample) => byId.get(sample.buildingId)!))].sort();
}

function sampleKinds(buildings: BuildingFeat[], name: string): string[] {
  const ids = new Set(buildings.filter((building) => building.overtureName === name).map((building) => building.id));
  const samples = directSunHoursSamplesForModel(model(buildings)).filter((sample) => ids.has(sample.buildingId));
  return [...new Set(samples.map((sample) => sample.kind))].sort();
}

function occluderCount(buildings: BuildingFeat[]): number {
  const mesh = buildFacadeOcclusionMesh(model(buildings));
  if (!mesh) return 0;
  const count = mesh.geometry.getAttribute("position").count;
  mesh.geometry.dispose();
  return count;
}

describe("imported buildings in Direct Sun Hours", () => {
  const all = massingDrawingBuildings([qaSchemeMassing(0)], origin, zone);
  const display = all.filter((building) => building.importedMassingSkipShadow);
  const casters = all.filter((building) => building.importedMassingShadowCaster);

  it("display footprints receive, shadow casters occlude", () => {
    expect(display).toHaveLength(3);
    expect(casters.length).toBeGreaterThanOrEqual(3);
    expect(display.every((building) => receivesSunHours(building) && !castsSunHoursShadow(building))).toBe(true);
    expect(casters.every((building) => castsSunHoursShadow(building) && !receivesSunHours(building))).toBe(true);
  });

  it("samples roofs and walls of every visible imported building", () => {
    expect(sampledNames(all)).toEqual(["Podium", "Tower A", "Tower B"]);
    for (const name of ["Tower A", "Podium", "Tower B"]) {
      expect(sampleKinds(all, name)).toEqual(["facade-bay", "roof-cell"]);
    }
    const samples = directSunHoursSamplesForModel(model(all));
    const casterIds = new Set(casters.map((building) => building.id));
    expect(samples.some((sample) => casterIds.has(sample.buildingId))).toBe(false);
  });

  it("builds a roof footprint for every visible imported building", () => {
    const m = model(all);
    const samples = directSunHoursSamplesForModel(m);
    const { buildingTriangles } = buildRoofFootprintMeshesForModel(m, samples, new Float32Array(samples.length).fill(1), 1);
    expect(display.every((building) => (buildingTriangles.get(building.id) ?? 0) > 0)).toBe(true);
    expect(casters.some((building) => buildingTriangles.has(building.id))).toBe(false);
  });

  it("occludes with shadow casters only, never with display footprints", () => {
    expect(occluderCount(display)).toBe(0);
    expect(occluderCount(casters)).toBeGreaterThan(0);
    expect(occluderCount(all)).toBe(occluderCount(casters));
  });

  it("drops a hidden building from samples and occlusion", () => {
    const hidden = massingDrawingBuildings([hide(qaSchemeMassing(0), "Podium")], origin, zone);
    expect(sampledNames(hidden)).toEqual(["Tower A", "Tower B"]);
    expect(occluderCount(hidden)).toBeGreaterThan(0);
    expect(occluderCount(hidden)).toBeLessThan(occluderCount(all));
  });

  it("drops every building of a hidden file", () => {
    const none = massingDrawingBuildings([{ ...qaSchemeMassing(0), visible: false }], origin, zone);
    expect(none).toEqual([]);
    expect(occluderCount(none)).toBe(0);
  });

  it("3D tab adds the imported buildings to the display model; Drawing uses the drawing model", () => {
    const map: BuildingFeat = { ...display[0]!, id: 1, importedMassing: undefined, importedMassingSkipShadow: undefined };
    const displayModel = model([map]);
    const drawingModel = model([map, ...all]);
    const on3d = sunHoursModel(false, displayModel, drawingModel, all);
    expect(on3d.buildings).toEqual([map, ...all]);
    expect(sampledNames(on3d.buildings.filter((building) => building.importedMassing))).toEqual([
      "Podium",
      "Tower A",
      "Tower B",
    ]);
    expect(sunHoursModel(false, displayModel, drawingModel, [])).toBe(displayModel);
    expect(sunHoursModel(true, displayModel, drawingModel, all)).toBe(drawingModel);
  });
});
