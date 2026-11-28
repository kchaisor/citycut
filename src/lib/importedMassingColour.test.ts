import { describe, expect, it } from "vitest";
import { normaliseMassingColour } from "./massingImport";
import { shadeHex, buildAxoMassingFaces } from "./explodedAxoMassing";
import { getColour } from "./colours";
import { planBuildingFill } from "./planBuildingFill";
import { buildIsometricDrawing } from "./isometricDrawing";
import { mgaCrs } from "./crsZone";
import { qaSchemeMassing } from "./qaSchemeFixture";
import { massingDrawingBuildings } from "./massingFootprint";
import type { ImportedMassing } from "./massingImport";
import type { BuildingFeat, CityModel } from "../types";

const origin = { lon: 144.9645, lat: -37.8216 };
const zone = mgaCrs(origin.lon).zone;

function siteModel(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Southbank",
    center: origin,
    sideM: 500,
    frameShape: "square",
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  } as CityModel;
}

function hidePodium(massing: ImportedMassing): ImportedMassing {
  return {
    ...massing,
    buildings: massing.buildings.map((building) => (building.name === "Podium" ? { ...building, visible: false } : building)),
  };
}

function display(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.filter((building) => building.importedMassing && !building.importedMassingShadowCaster);
}

function axoFacesByFill(buildings: BuildingFeat[]) {
  const { faces } = buildAxoMassingFaces(siteModel(buildings));
  return (fill: string) => ({
    roofs: faces.filter((f) => f.paint === "building-roof" && f.fill === fill).length,
    walls: faces.filter(
      (f) =>
        (f.paint === "building-wall-light" && f.fill === shadeHex(fill, 0.86)) ||
        (f.paint === "building-wall-dark" && f.fill === shadeHex(fill, 0.72)),
    ).length,
  });
}

describe("imported massing colour", () => {
  it("defaults to the white --imported-massing token", () => {
    expect(getColour("--imported-massing")).toBe("#FFFFFF");
  });
  it("normalises picker values", () => {
    expect(normaliseMassingColour("#ff00aa")).toBe("#FF00AA");
    expect(normaliseMassingColour("red")).toBeNull();
    expect(normaliseMassingColour(undefined)).toBeNull();
  });
  it("shades walls toward black", () => {
    expect(shadeHex("#FFFFFF", 0.5)).toBe("#808080");
  });
  it("carries the colour into exploded axo faces", () => {
    const building = {
      id: "m1",
      importedMassing: true,
      importedColour: "#3366CC",
      height: 10,
      ring: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
      holes: [],
    } as unknown as BuildingFeat;
    const model = { sideM: 200, buildings: [building] } as unknown as CityModel;
    const { faces } = buildAxoMassingFaces(model);
    expect(faces.length).toBeGreaterThan(1);
    expect(faces.find((f) => f.paint === "building-roof")?.fill).toBe("#3366CC");
    expect(faces.every((f) => typeof f.fill === "string")).toBe(true);
  });
  it("uses the per-model colour for the plan fill", () => {
    const b = { importedMassing: true, importedColour: "#3366CC" } as unknown as BuildingFeat;
    expect(String(planBuildingFill({ buildings: [b] } as never, b, "uniform" as never, false)).toUpperCase()).toContain("3366CC");
  });
});

describe("imported buildings in Drawing take the imported white or the file colour", () => {
  const white = getColour("--imported-massing");

  it("fills every building white, with no use colour", () => {
    expect(white).toBe("#FFFFFF");
    const plan = display(massingDrawingBuildings([qaSchemeMassing(0)], origin, zone));
    const m = siteModel(plan);
    expect(plan.map((b) => b.overtureName)).toEqual(["Tower A", "Podium", "Tower B"]);
    expect(plan.map((b) => planBuildingFill(m, b, "use" as never, false))).toEqual([white, white, white]);
    for (const b of plan) {
      expect(b.ring.length).toBeGreaterThanOrEqual(4);
      expect(b.ring[0]).toEqual(b.ring.at(-1));
      expect(b.height).toBeGreaterThan(0);
    }
  });

  it("shows a file colour in plan, exploded axo and isometric drawing", () => {
    const all = massingDrawingBuildings([{ ...qaSchemeMassing(0), colour: "#3366CC" }], origin, zone);
    const m = siteModel(all);
    expect(display(all).map((b) => planBuildingFill(m, b, "use" as never, false))).toEqual(["#3366CC", "#3366CC", "#3366CC"]);
    const axo = axoFacesByFill(all)("#3366CC");
    expect(axo.roofs).toBe(3);
    expect(axo.walls).toBeGreaterThanOrEqual(6);
    const roofs = buildIsometricDrawing(m).solids.flatMap((s) => (s.kind === "building" && s.imported ? [s.roofFill] : []));
    expect(roofs).toEqual(["#3366CC", "#3366CC", "#3366CC"]);
  });

  it("shows the imported white in exploded axo, roof and walls per visible building, and no use colour", () => {
    const axo = axoFacesByFill(massingDrawingBuildings([qaSchemeMassing(0)], origin, zone));
    expect(axo(white).roofs).toBe(3);
    expect(axo(white).walls).toBeGreaterThanOrEqual(6);
    for (const token of ["--use-residential", "--use-commercial", "--use-unclassified"] as const) {
      expect(axo(getColour(token))).toEqual({ roofs: 0, walls: 0 });
    }
  });

  it("leaves a hidden building out of the exploded axo", () => {
    const axo = axoFacesByFill(massingDrawingBuildings([hidePodium(qaSchemeMassing(0))], origin, zone));
    expect(axo(white).roofs).toBe(2);
  });

  it("shows the imported white in the isometric drawing, without white caster solids", () => {
    const all = massingDrawingBuildings([qaSchemeMassing(0)], origin, zone);
    const solids = buildIsometricDrawing(siteModel(all)).solids.flatMap((s) => (s.kind === "building" && s.imported ? [s] : []));
    const byId = new Map(all.map((b) => [b.id, b]));
    expect(solids.every((s) => !byId.get(s.id)!.importedMassingShadowCaster)).toBe(true);
    expect(Object.fromEntries(solids.map((s) => [byId.get(s.id)!.overtureName, s.roofFill]))).toEqual({
      "Tower A": white,
      Podium: white,
      "Tower B": white,
    });
  });
});
