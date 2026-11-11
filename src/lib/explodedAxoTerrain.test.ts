import { describe, expect, it } from "vitest";
import { AXO_TERRAIN_UNAVAILABLE_NOTE, buildAxoTerrainMesh } from "./explodedAxoTerrain";
import { AXO_LAYER_LABELS, DEFAULT_AXO_LAYER_ORDER, axoPlateLabelText, axoPlateShowsAerial, buildAxoGroundTopoContours, buildExplodedAxoLayers, defaultExplodedAxoSettings, explodedAxoBounds } from "./explodedAxo";
import { explodedAxoChunks } from "./explodedAxoExport";
import type { CityModel, TerrainField } from "../types";

const field: TerrainField = {
  cols: 3,
  rows: 3,
  heights: new Float32Array([10, 15, 20, 15, 20, 25, 20, 25, 30]),
  min: 10,
  max: 30,
  spacingM: 250,
  zoom: 15,
  metresPerPixel: 3,
  source: "Mapterhorn",
};

const model = (terrain?: TerrainField) =>
  ({ placeLabel: "T", center: { lat: -37.8, lon: 144.9 }, sideM: 500, frameShape: "square", layers: {}, buildings: [], roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "", terrain }) as unknown as CityModel;

const ys = (d: string) => [...d.matchAll(/[ML][\d.-]+ ([\d.-]+)/g)].map((m) => Number(m[1]));

describe("exploded axo terrain mesh", () => {
  it("samples the Mapterhorn field and scales relief by the exaggeration", () => {
    const flat = buildAxoTerrainMesh(model(), { ...field, heights: new Float32Array(9).fill(10), max: 10 }, 3, 4);
    const x1 = buildAxoTerrainMesh(model(), field, 1, 4);
    const x3 = buildAxoTerrainMesh(model(), field, 3, 4);
    expect(x1).toHaveLength(10);
    const lastY = (paths: string[]) => ys(paths[paths.length - 1]!).at(-1)!;
    expect(lastY(flat) - lastY(x1)).toBeCloseTo(20, 1);
    expect(lastY(flat) - lastY(x3)).toBeCloseTo(60, 1);
  });

  it("shows a visible note when the terrain fails to load, never silently empty", () => {
    const settings = defaultExplodedAxoSettings(500);
    settings.layerVisible.terrain = true;
    const t = buildExplodedAxoLayers(model(), settings, { terrain: "unavailable" }).layers.find((l) => l.id === "terrain")!;
    expect(t.unavailableNote).toBe(AXO_TERRAIN_UNAVAILABLE_NOTE);
    const ok = buildExplodedAxoLayers(model(field), settings).layers.find((l) => l.id === "terrain")!;
    expect(ok.unclippedStrokes?.length).toBeGreaterThan(0);
    expect(ok.sourceNote).toContain("×3 vertical");
    expect(JSON.stringify(explodedAxoChunks(model(field), 1000, settings))).toContain("\"Terrain\"");
  });

  it("toggling terrain or changing exaggeration never moves the fitted view", () => {
    const base = defaultExplodedAxoSettings(500);
    const on = { ...base, layerVisible: { ...base.layerVisible, terrain: true }, terrainExaggeration: 10 };
    expect(explodedAxoBounds(model(field), on)).toEqual(explodedAxoBounds(model(field), base));
  });

  it("keeps Terrain at the bottom with 3D contours and Aerial image as a separate flat layer", () => {
    expect(DEFAULT_AXO_LAYER_ORDER.at(-1)).toBe("terrain");
    expect(DEFAULT_AXO_LAYER_ORDER.at(-2)).toBe("aerial");
    expect(DEFAULT_AXO_LAYER_ORDER).not.toContain("topography");
    expect(AXO_LAYER_LABELS.terrain).toBe("TERRAIN");
    expect(axoPlateLabelText("terrain")).toBe("Terrain.");
    expect(AXO_LAYER_LABELS.aerial).toBe("AERIAL IMAGE");
    expect(axoPlateLabelText("aerial")).toBe("Aerial image.");
    expect(axoPlateShowsAerial("terrain")).toBe(false);
    expect(axoPlateShowsAerial("aerial")).toBe(true);

    const contours = buildAxoGroundTopoContours(model(field), field, 2);
    expect(contours.length).toBeGreaterThan(0);
    const contoursX1 = buildAxoGroundTopoContours(model(field), field, 1);
    expect(ys(contours.at(-1)!)[0]).toBeLessThan(ys(contoursX1.at(-1)!)[0]!);
  });
});
