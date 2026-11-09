import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { projectLocal } from "./crs";
import { drawingModelBuildings } from "./drawingModelBuildings";
import { figureGroundModelPaths } from "./figureGround";
import { filterHiddenBuildings, hideBuildings, matchHiddenBuildings, emptyHiddenStore } from "./hiddenBuildings";
import { massingDrawingBuildings, massingFootprint } from "./massingFootprint";
import { mgaPlacement, parseMassing3dm, type ImportedMassing } from "./massingImport";
import { loadRhino } from "./rhinoExport";
import { buildAxoMassingFaces } from "./explodedAxoMassing";
import { sitePlanAi } from "./aiPlan";
import { explodedAxoChunks } from "./explodedAxoExport";
import { defaultExplodedAxoSettings } from "./explodedAxo";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { planPaths } from "./svgPlan";
import type { BuildingFeat, CityModel, Pt } from "../types";

const fixture3dm = fileURLToPath(new URL("./__fixtures__/east-melbourne-import-massing.3dm", import.meta.url));

const origin = { lon: 144.98038, lat: -37.81356 };
const zone = 55;

function square(c: Pt, size: number): Pt[] {
  const h = size / 2;
  return [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h], [c[0] - h, c[1] - h]];
}

const pullman: BuildingFeat = { id: 1, ring: square([60, -60], 40), holes: [], height: 73.1, use: "residential", source: "none" };
const other: BuildingFeat = { id: 2, ring: square([-60, 60], 20), holes: [], height: 12, use: "civic", source: "zone" };

const model: CityModel = {
  placeLabel: "East Melbourne",
  center: origin,
  sideM: 300,
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
  buildings: [pullman, other],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "test",
};

function boxMassing(rotDeg = 0): ImportedMassing {
  const [e, n] = projectLocal([60, -60], origin, zone);
  const p: number[] = [];
  for (const z of [0, 40]) for (const [x, y] of [[-10, -15], [10, -15], [10, 15], [-10, 15]]) p.push(x!, y!, z);
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const idx: number[] = [];
  for (const [a, b, c, d] of quads) idx.push(a!, b!, c!, a!, c!, d!);
  return {
    id: "m", name: "massing.3dm", fileBytes: 1, mode: "mga", visible: true,
    positions: new Float32Array(p), indices: new Uint32Array(idx), triangles: 12,
    anchor: { e, n, z: 30 }, halfExtent: { x: 10, y: 15 }, sourceUnits: "Meters", unitScale: 1,
    fileZone: 55, rejectedSurfaces: 0, notes: [],
    placement: { e, n, base: 30, rotDeg },
  };
}

function area(ring: Pt[]): number {
  let s = 0;
  for (let i = 0; i + 1 < ring.length; i++) s += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return Math.abs(s / 2);
}

describe("imported massing and hidden buildings in Drawing", () => {
  it("footprint is the placed box outline, at its MGA position and rotation", () => {
    const { polygons, topZ } = massingFootprint(boxMassing(), origin, zone);
    expect(polygons).toHaveLength(1);
    expect(area(polygons[0]![0] as Pt[])).toBeCloseTo(600, 0);
    expect(topZ).toBeCloseTo(70, 3);
    const xs = polygons[0]![0]!.map((p) => p[0]);
    expect(Math.abs(Math.min(...xs) - 50)).toBeLessThan(0.5);
    expect(Math.abs(Math.max(...xs) - 70)).toBeLessThan(0.5);
    const turned = massingFootprint(boxMassing(90), origin, zone).polygons[0]![0]!.map((p) => p[0]);
    expect(Math.abs(Math.max(...turned) - Math.min(...turned) - 30)).toBeLessThan(0.6);
  });

  it("site plan: hidden building gone, imported footprint drawn yellow (screen and .ai share planPaths)", async () => {
    const hidden = hideBuildings(emptyHiddenStore(), [pullman], origin);
    const ids = new Set(matchHiddenBuildings(model.buildings, hidden, origin).keys());
    const display = { ...model, buildings: filterHiddenBuildings(model.buildings, ids) };
    const drawing = { ...display, buildings: [...display.buildings, ...massingDrawingBuildings([boxMassing()], origin, zone)] };
    const plan = planPaths(drawing);
    expect(plan.buildings).toHaveLength(2);
    expect(plan.buildings.filter((b) => b.imported)).toHaveLength(1);
    const bytes = await sitePlanAi(drawing, 1000);
    expect(new TextDecoder("latin1").decode(bytes)).toContain("Imported massing");
    const without = await sitePlanAi(display, 1000);
    expect(new TextDecoder("latin1").decode(without)).not.toContain("Imported massing");
    expect(planPaths(display).buildings.some((b) => b.imported)).toBe(false);
    expect(planPaths(display).buildings).toHaveLength(1);
  }, 30_000);

  it("figure-ground and exploded axo export include imported massing solids", () => {
    const display = { ...model, buildings: [other] };
    const imported = massingDrawingBuildings([boxMassing()], origin, zone);
    const drawing = { ...display, buildings: [...display.buildings, ...imported] };
    expect(figureGroundModelPaths(display.buildings, model.sideM)).toHaveLength(1);
    expect(figureGroundModelPaths(drawing.buildings, model.sideM)).toHaveLength(2);
    const { faces } = buildAxoMassingFaces(drawing);
    const importedHex = getColour("--imported-massing");
    expect(faces.some((face) => face.fill === importedHex)).toBe(true);
    const chunks = explodedAxoChunks(drawing, 1000, defaultExplodedAxoSettings(model.sideM));
    const importedRgb = hexRgb(importedHex);
    const buildingsChunk = chunks.find((chunk) => chunk.name === "Buildings");
    expect(
      buildingsChunk?.paths?.some(
        (path) =>
          path.fill?.[0] === importedRgb[0] &&
          path.fill?.[1] === importedRgb[1] &&
          path.fill?.[2] === importedRgb[2],
      ),
    ).toBe(true);
  });

  it("parsed east-melbourne-import-massing.3dm lands in plan and exploded axo exports", async () => {
    const rhino = await loadRhino();
    const parsed = parseMassing3dm(rhino, readFileSync(fixture3dm));
    const item: ImportedMassing = {
      ...parsed,
      id: "fixture",
      name: "east-melbourne-import-massing.3dm",
      fileBytes: parsed.positions.byteLength,
      mode: "mga",
      visible: true,
      placement: mgaPlacement(parsed),
    };
    const imported = massingDrawingBuildings([item], origin, zone);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.importedMassing).toBe(true);
    const drawing = { ...model, buildings: drawingModelBuildings(model.buildings, imported, false) };
    expect(drawing.buildings).toEqual(imported);
    const plan = planPaths(drawing);
    expect(plan.buildings.filter((b) => b.imported)).toHaveLength(1);
    const bytes = await sitePlanAi(drawing, 1000);
    expect(new TextDecoder("latin1").decode(bytes)).toContain("Imported massing");
    const importedHex = getColour("--imported-massing");
    const importedRgb = hexRgb(importedHex);
    const chunks = explodedAxoChunks(drawing, 1000, defaultExplodedAxoSettings(model.sideM));
    const buildingsChunk = chunks.find((chunk) => chunk.name === "Buildings");
    expect(
      buildingsChunk?.paths?.some(
        (path) =>
          path.fill?.[0] === importedRgb[0] &&
          path.fill?.[1] === importedRgb[1] &&
          path.fill?.[2] === importedRgb[2],
      ),
    ).toBe(true);
  }, 30_000);

  it("hidden imported models are left out of drawings", () => {
    expect(massingDrawingBuildings([{ ...boxMassing(), visible: false }], origin, zone)).toEqual([]);
  });
});
