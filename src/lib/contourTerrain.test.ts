import { describe, expect, it } from "vitest";
import { contourTerrain, contourTerrainNotice, CONTOUR_TERRAIN_SOURCE } from "./contourTerrain";
import { footprintBase, sampleTerrain } from "./terrain";
import { clearPlanShadowCache, planShadowRings } from "./buildingShadows";
import type { BuildingFeat, CityModel, ContourLayer, Pt, TerrainField } from "../types";

const sideM = 400;

function hillLayer(maxR = 180): ContourLayer {
  const lines = [];
  for (let z = 96; 100 - z / 1 >= 0 && (100 - z) * 10 <= maxR; z -= 2) {
    const r = (100 - z) * 10;
    const points: Pt[] = [];
    for (let k = 0; k <= 72; k++) points.push([r * Math.cos((k / 72) * 2 * Math.PI), r * Math.sin((k / 72) * 2 * Math.PI)]);
    lines.push({ z, points });
  }
  return { source: "vicmap-metro", label: "Vicmap metro", interval: 2, lines, attribution: null, datasetUrl: null, featureCount: lines.length, fetchMs: 0 };
}

function demField(fn: (e: number, n: number) => number, cols = 81): TerrainField {
  const heights = new Float32Array(cols * cols);
  for (let r = 0; r < cols; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = fn(-sideM / 2 + (c * sideM) / (cols - 1), -sideM / 2 + (r * sideM) / (cols - 1));
  return { cols, rows: cols, heights, min: Math.min(...heights), max: Math.max(...heights), spacingM: sideM / (cols - 1), zoom: 14, metresPerPixel: 7, source: "Mapterhorn" };
}

describe("contour ground", () => {
  it("interpolates between contours to within a fraction of the interval", () => {
    const res = contourTerrain(hillLayer(), sideM, null)!;
    expect(res.field.source).toBe(CONTOUR_TERRAIN_SOURCE);
    for (const r of [55, 85, 125, 165]) {
      const z = sampleTerrain(res.field, r * Math.SQRT1_2, r * Math.SQRT1_2, sideM);
      expect(Math.abs(z - (100 - r / 10))).toBeLessThan(1.0);
    }
  });

  it("keeps the DEM grid, shifts the DEM to the contours, and falls back to it far from contours (flagged)", () => {
    const dem = demField((e, n) => 100 - Math.hypot(e, n) / 10 - 3);
    const res = contourTerrain(hillLayer(100), sideM, dem)!;
    expect(res.field.cols).toBe(dem.cols);
    expect(res.demOffsetM!).toBeCloseTo(3, 0);
    expect(res.coverage).toBeLessThan(1);
    expect(sampleTerrain(res.field, 195, 195, sideM)).toBeCloseTo(100 - Math.hypot(195, 195) / 10, 0);
    expect(contourTerrainNotice(res, hillLayer(100), true)).toMatch(/falls back to Mapterhorn/);
  });

  it("never silently falls back: outside metro coverage the notice says so", () => {
    const state = { ...hillLayer(), source: "vicmap-state" as const };
    expect(contourTerrain(state, sideM, null)).toBeNull();
    expect(contourTerrainNotice(null, state, true)).toMatch(/outside Vicmap metro/);
    expect(contourTerrainNotice(null, null, true)).toMatch(/Mapterhorn DEM fallback/);
  });

  it("building bases and plan shadows sample the same contour surface", () => {
    const res = contourTerrain(hillLayer(), sideM, null)!;
    const ring: Pt[] = [[60, 0], [80, 0], [80, 20], [60, 20], [60, 0]];
    const b: BuildingFeat = { id: 1, ring, holes: [], height: 10, use: "retail", source: "none" };
    const base = footprintBase(res.field, ring, sideM);
    expect(base).toBeCloseTo(Math.min(...ring.map(([e, n]) => sampleTerrain(res.field, e, n, sideM))), 6);
    const model = { placeLabel: "Hill", center: { lon: 145.03, lat: -37.8 }, sideM, terrain: res.field, layers: { buildings: true, roads: false, waterGreen: false, trees: false }, buildings: [b], roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "" } as unknown as CityModel;
    clearPlanShadowCache();
    const flat = { ...model, terrain: undefined } as CityModel;
    const onHill = planShadowRings(model, { lat: -37.8, lon: 145.03, year: 2026, month: 6, day: 22, hour: 12, minute: 0 }, true);
    clearPlanShadowCache();
    const onFlat = planShadowRings(flat, { lat: -37.8, lon: 145.03, year: 2026, month: 6, day: 22, hour: 12, minute: 0 }, true);
    expect(onHill.length).toBeGreaterThan(0);
    expect(JSON.stringify(onHill)).not.toBe(JSON.stringify(onFlat));
  });
});
