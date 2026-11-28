import { describe, expect, it } from "vitest";
import { drawnContourLayer, interpolatedContourLines } from "./drawnContours";
import { AXO_TOPOGRAPHY_STROKE_SCALE, buildExplodedAxoLayers, defaultExplodedAxoSettings } from "./explodedAxo";
import { planPaths } from "./svgPlan";
import { demContourLayer } from "./vicmapContours";
import type { CityModel, ContourLayer, ContourSourceId, LonLat, TerrainField } from "../types";

const SIDE_M = 200;
const HALF = SIDE_M / 2;
const ROZELLE: LonLat = { lon: 151.171, lat: -33.861 };
const SYDNEY_CBD: LonLat = { lon: 151.207, lat: -33.868 };

function slopeField(reliefM: number, cols = 41): TerrainField {
  const heights = new Float32Array(cols * cols);
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) heights[row * cols + col] = (reliefM * col) / (cols - 1);
  }
  return {
    cols,
    rows: cols,
    heights,
    min: 0,
    max: reliefM,
    spacingM: SIDE_M / (cols - 1),
    zoom: 14,
    metresPerPixel: 4,
    source: "test",
  };
}

function eastFor(z: number, reliefM: number): number {
  return -HALF + (SIDE_M * z) / reliefM;
}

function officialLayer(source: ContourSourceId, interval: number, levels: number[], reliefM: number): ContourLayer {
  return {
    source,
    label: source === "nsw-2m" ? "NSW Elevation 2 m contours" : "City of Sydney 1 m contours, NSW contours outside the City",
    interval,
    lines: levels.map((z) => ({
      z,
      points: [
        [eastFor(z, reliefM), -HALF + 4],
        [eastFor(z, reliefM), HALF - 4],
      ],
    })),
    attribution: null,
    datasetUrl: null,
    featureCount: levels.length,
    fetchMs: 0,
  };
}

function modelWith(layer: ContourLayer | null, terrain: TerrainField | null, center: LonLat = ROZELLE): CityModel {
  return {
    placeLabel: "Test",
    center,
    sideM: SIDE_M,
    frameShape: "square",
    layers: { buildings: false, roads: false, waterGreen: false, trees: false },
    buildings: [],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
    contours: true,
    contourLayer: layer,
    terrain,
  } as unknown as CityModel;
}

function levelsOf(layer: ContourLayer | null): number[] {
  return [...new Set((layer?.lines ?? []).map((line) => Math.round(line.z * 10) / 10))].sort((a, b) => a - b);
}

describe("1 m drawn contours", () => {
  it("adds interpolated 1 m lines between official NSW 2 m lines and keeps the official ones", () => {
    const official = officialLayer("nsw-2m", 2, [2, 4, 6, 8], 10);
    const drawn = drawnContourLayer(modelWith(official, slopeField(10)));
    expect(drawn?.interval).toBe(1);
    expect(levelsOf(drawn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const line of official.lines) expect(drawn?.lines).toContain(line);
    expect(drawn?.lines.filter((line) => line.z % 2 === 0)).toHaveLength(official.lines.length);
  });

  it("interpolates NSW 2 m lines from the Laplace contour field when the cut has no terrain field", () => {
    const official = officialLayer("nsw-2m", 2, [2, 4, 6, 8], 10);
    const drawn = drawnContourLayer(modelWith(official, null));
    const levels = levelsOf(drawn);
    for (const z of [3, 5, 7]) expect(levels).toContain(z);
    for (const z of [2, 4, 6, 8]) expect(levels).toContain(z);
  });

  it("marks only the 5 m levels as heavier index lines on the drawn site plan", () => {
    const official = officialLayer("nsw-2m", 2, [2, 4, 6, 8], 10);
    const model = modelWith(official, slopeField(10));
    for (const scale of [500, 1000, 2500]) {
      const plan = planPaths(model, 1.2, 5, scale);
      expect(plan.contourInterval).toBe(1);
      const drawn = drawnContourLayer(model)!;
      expect(plan.contourIndex).toHaveLength(drawn.lines.length);
      drawn.lines.forEach((line, i) => {
        expect(plan.contourIndex[i]).toBe(line.z % 5 === 0);
      });
      expect(plan.contourIndex.some(Boolean)).toBe(true);
    }
  });

  it("traces DEM-only sites every 1 m whatever the relief", () => {
    const field = slopeField(28);
    const layer = demContourLayer(field, SIDE_M);
    expect(layer.interval).toBe(1);
    expect(levelsOf(layer)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    const plan = planPaths(modelWith(null, field), 1.2, 5, 1000);
    expect(plan.contourInterval).toBe(1);
    expect(plan.contourIndex.filter(Boolean)).toHaveLength(5);
  });

  it("fills NSW 1 m levels only outside the City of Sydney on a mixed cut", () => {
    const mixed = officialLayer("cos-nsw", 1, [2, 4, 6, 8], 10);
    expect(levelsOf(drawnContourLayer(modelWith(mixed, slopeField(10), SYDNEY_CBD)))).toEqual([2, 4, 6, 8]);
    expect(levelsOf(drawnContourLayer(modelWith(mixed, slopeField(10), ROZELLE)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("leaves official 1 m layers untouched and skips levels already on the official interval", () => {
    const cos = officialLayer("cos-1m", 1, [1, 2, 3], 10);
    expect(drawnContourLayer(modelWith(cos, slopeField(10)))).toBe(cos);
    const infill = interpolatedContourLines(slopeField(10), SIDE_M, 2);
    expect(levelsOf({ ...cos, lines: infill })).toEqual([1, 3, 5, 7, 9]);
  });

  it("draws nothing when contours are off", () => {
    expect(drawnContourLayer({ ...modelWith(null, slopeField(10)), contours: false })).toBeNull();
  });

  it("draws 1 m contours with heavier 5 m index lines on the exploded-axo terrain and topography plates", () => {
    const official = officialLayer("nsw-2m", 2, [2, 4, 6, 8], 10);
    const model = { ...modelWith(official, slopeField(10)), region: "nsw" } as CityModel;
    const base = defaultExplodedAxoSettings(SIDE_M);
    const settings = {
      ...base,
      layerOrder: [...base.layerOrder, "topography" as const],
      layerVisible: { ...base.layerVisible, terrain: true, topography: true, aerial: false, base: false },
    };
    const { layers } = buildExplodedAxoLayers(model, settings, {
      topography: { contours: official.lines.map((line) => ({ z: line.z, line: line.points })), sourceLabel: official.label },
    });
    const terrain = layers.find((layer) => layer.id === "terrain")!;
    expect(terrain.topoContourIndex?.length).toBe(terrain.topoContourStrokes?.length);
    expect(terrain.topoContourIndex?.filter(Boolean).length).toBeGreaterThan(0);
    expect(terrain.topoContourIndex?.filter((index) => !index).length).toBeGreaterThan(0);

    const topography = layers.find((layer) => layer.id === "topography")!;
    const drawn = drawnContourLayer(model)!;
    expect(topography.strokes).toHaveLength(drawn.lines.length);
    drawn.lines.forEach((line, i) => {
      const scale = topography.strokeWidthScales![i]!;
      if (line.z % 5 === 0) expect(scale).toBeGreaterThan(AXO_TOPOGRAPHY_STROKE_SCALE);
      else expect(scale).toBe(AXO_TOPOGRAPHY_STROKE_SCALE);
    });
  });
});
