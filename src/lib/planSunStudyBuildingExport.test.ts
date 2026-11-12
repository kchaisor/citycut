import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sitePlanAi8, sitePlanChunks, sitePlanSvg } from "./aiPlan";
import type { Rgb } from "./aiDocument";
import { parseNativeAiLayerFillRgbs } from "./aiNative";
import { planShadowRings } from "./buildingShadows";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
import type { BuildingFeat, CityModel, Pt } from "../types";

const importedRhinoGray = "#687888";
const at = { lat: -33.8572, lon: 151.21512 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

function baseModel(buildings: BuildingFeat[], siteBuildingIds?: number[]): CityModel {
  return {
    placeLabel: "Sun study export",
    center: at,
    sideM: 400,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    ...(siteBuildingIds ? { siteBuildingIds } : {}),
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

const imported: BuildingFeat = {
  id: 901,
  ring: square([0, 0], 40),
  holes: [],
  height: 24,
  use: "unclassified",
  source: "none",
  importedMassing: true,
  importedColour: importedRhinoGray,
};

const siteBuilding: BuildingFeat = {
  id: 902,
  ring: square([80, 0], 30),
  holes: [],
  height: 12,
  use: "unclassified",
  source: "none",
};

function sunStudyOptions(selected: readonly number[], muted = true) {
  const date = { ...at, year: 2026, month: 9, day: 22 };
  const model = baseModel([imported, siteBuilding], [siteBuilding.id]);
  const layers = SUN_STUDY_HOURS.map((hour) => ({
    hour,
    rings: [...planShadowRings(model, { ...date, hour, minute: 0 }, true)],
  }));
  return {
    model,
    date,
    options: {
      sunStudy: { layers },
      sunStudyDate: date,
      sunStudyMuted: muted,
      sunStudySelected: selected,
      shadows: { ...date, hour: 12, minute: 0 },
      castShadows: false,
    },
  };
}

function rgbClose(a: Rgb, b: Rgb, eps = 0.02) {
  expect(Math.abs(a[0] - b[0])).toBeLessThan(eps);
  expect(Math.abs(a[1] - b[1])).toBeLessThan(eps);
  expect(Math.abs(a[2] - b[2])).toBeLessThan(eps);
}

describe("sun-study site plan building fills", () => {
  it("exports selected imported massing as --sun-study-sun, not the Rhino material gray", () => {
    const { model, options } = sunStudyOptions([imported.id]);
    const chunks = sitePlanChunks(model, 1000, undefined, options);
    const importedChunk = chunks.find((chunk) => chunk.name === "Imported massing");
    const fill = importedChunk?.paths?.[0]?.fill;
    expect(fill).toBeDefined();
    rgbClose(fill!, hexRgb(getColour("--sun-study-sun")));
    expect(fill).not.toEqual(hexRgb(importedRhinoGray));

    const ai = sitePlanAi8(model, 1000, undefined, options);
    const aiFills = parseNativeAiLayerFillRgbs(ai, "Imported massing");
    expect(aiFills.length).toBeGreaterThan(0);
    rgbClose(aiFills[0]!, hexRgb(getColour("--sun-study-sun")));
  });

  it("exports muted unselected imported massing as --sun-study-building, not the Rhino gray", async () => {
    const { model, options } = sunStudyOptions([]);
    const chunks = sitePlanChunks(model, 1000, undefined, options);
    const fill = chunks.find((chunk) => chunk.name === "Imported massing")?.paths?.[0]?.fill;
    rgbClose(fill!, hexRgb(getColour("--sun-study-building")));
    expect(fill).not.toEqual(hexRgb(importedRhinoGray));

    const ai = sitePlanAi8(model, 1000, undefined, options);
    const aiFills = parseNativeAiLayerFillRgbs(ai, "Imported massing");
    rgbClose(aiFills[0]!, hexRgb(getColour("--sun-study-building")));

    const svg = await sitePlanSvg(model, 1000, undefined, options);
    expect(svg).toContain(getColour("--sun-study-building").toLowerCase());
    expect(svg).not.toContain(importedRhinoGray.toLowerCase());
  });

  it("keeps site buildings on --site-building during sun study", () => {
    const { model, options } = sunStudyOptions([]);
    const fill = sitePlanChunks(model, 1000, undefined, options).find((chunk) => chunk.name === "Site buildings")
      ?.paths?.[0]?.fill;
    rgbClose(fill!, hexRgb(getColour("--site-building")));
  });

  it("writes a sun-study .ai artifact with yellow imported massing when CITYCUT_WRITE_ARTIFACTS=1", () => {
    if (process.env.CITYCUT_WRITE_ARTIFACTS !== "1") return;
    const { model, options } = sunStudyOptions([imported.id]);
    const ai = sitePlanAi8(model, 1000, undefined, options);
    const outDir = "/opt/cursor/artifacts";
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "sun-study-imported-selected.ai"), ai);
    const fills = parseNativeAiLayerFillRgbs(ai, "Imported massing");
    rgbClose(fills[0]!, hexRgb(getColour("--sun-study-sun")));
  });
});
