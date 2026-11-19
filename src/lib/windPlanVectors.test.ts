import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CityModel, Pt } from "../types";
import { downwindFromSector } from "./windRose";
import { windSeasonWeights } from "./windComfort";
import { WIND_SPEED_BIN_EDGES_MS } from "./windBins";
import type { WindRoseSeasonRecord } from "./windRoseData";
import {
  accumulateSectorFlow,
  buildWindPlanRatio,
  createWindPlanComfortJob,
  createWindPlanSpeedJob,
  emptyWindPlanFlow,
  windPlanReferenceMs,
  type WindPlanFlow,
  type WindPlanGeometry,
  type WindPlanJob,
} from "./windPlanField";
import {
  WIND_PLAN_VECTOR_MIN_FRACTION,
  WIND_PLAN_VECTOR_MIN_GAP_PX,
  WIND_PLAN_VECTOR_SPACING_M,
  windPlanVectorLengthPx,
  windPlanVectors,
  windPlanVectorSites,
  windPlanVectorStride,
  type WindPlanVector,
} from "./windPlanVectors";

const SOUTH = 8;
const WEST = 12;

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function modelOf(sideM: number, boxes: Array<{ ring: Pt[]; height: number }>, water: Pt[] | null = null): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: boxes.map((box, k) => ({ id: k + 1, ring: box.ring, holes: [], height: box.height, use: "residential", source: "osm_tag" })),
    roads: [],
    areas: water ? [{ id: 1, ring: water, holes: [], kind: "water" }] : [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

function season(sectorBins: Record<number, number[]>): WindRoseSeasonRecord {
  const sectors = Array.from({ length: 16 }, (_, s) => sectorBins[s] ?? [0, 0, 0, 0, 0]);
  return { calmPct: 10, prevailingDirDeg: 0, meanSpeedMs: 3, sectors };
}

function run<T>(job: WindPlanJob<T> | null): T {
  expect(job).not.toBeNull();
  while (!job!.step(Infinity));
  return job!.result()!;
}

function nearest(vectors: readonly WindPlanVector[], east: number, north: number): WindPlanVector {
  let best = vectors[0]!;
  for (const v of vectors) if (Math.hypot(v.east - east, v.north - north) < Math.hypot(best.east - east, best.north - north)) best = v;
  return best;
}

function geometryOf(cols: number, rows: number, cellM: number): WindPlanGeometry {
  return {
    cols,
    rows,
    cellM,
    originE: (-cols * cellM) / 2,
    originN: (-rows * cellM) / 2,
    solid: new Uint8Array(cols * rows),
    water: new Uint8Array(cols * rows),
  };
}

const weights = windSeasonWeights(season({ [SOUTH]: [10, 20, 10, 5, 0], [WEST]: [10, 20, 10, 5, 0] }), WIND_SPEED_BIN_EDGES_MS);

describe("plan wind vector sites", () => {
  it("lays a regular world-space grid on open land", () => {
    const geometry = geometryOf(60, 60, 2);
    const sites = windPlanVectorSites(geometry, 20, 0);
    expect(sites.length).toBe(6 * 6);
    for (const site of sites) {
      expect(Math.abs(site.east % 20)).toBe(0);
      expect(Math.abs(site.north % 20)).toBe(0);
    }
  });

  it("puts no vector on buildings or water but keeps the open land", () => {
    const geometry = geometryOf(60, 60, 2);
    for (let j = 0; j < 60; j++) {
      for (let i = 0; i < 60; i++) {
        if (i < 20) geometry.solid[j * 60 + i] = 1;
        else if (i >= 40) geometry.water[j * 60 + i] = 1;
      }
    }
    const sites = windPlanVectorSites(geometry, 10, 0);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(geometry.solid[site.idx]).toBe(0);
      expect(geometry.water[site.idx]).toBe(0);
      expect(site.east).toBeGreaterThanOrEqual(-20);
      expect(site.east).toBeLessThan(20);
    }
  });

  it("keeps vectors off a real model's footprints and water", () => {
    const model = modelOf(240, [{ ring: ring(-20, -20, 20, 20), height: 20 }], ring(60, -120, 120, 120));
    const { geometry } = buildWindPlanRatio(model, SOUTH);
    const sites = windPlanVectorSites(geometry);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(site.east > -22 && site.east < 22 && site.north > -22 && site.north < 22).toBe(false);
      expect(site.east).toBeLessThan(60);
    }
  });
});

describe("plan wind vector directions", () => {
  const model = modelOf(400, [{ ring: ring(-30, -30, 30, 30), height: 30 }]);

  it("points downwind on open ground and follows the selected heading", () => {
    const south = run(createWindPlanSpeedJob(model, "vec:annual", windPlanReferenceMs(weights, SOUTH), SOUTH));
    const west = run(createWindPlanSpeedJob(model, "vec:annual", windPlanReferenceMs(weights, WEST), WEST));
    const sites = windPlanVectorSites(south.geometry);
    const openSouth = nearest(windPlanVectors(sites, south.flow, 4), -150, -150);
    const openWest = nearest(windPlanVectors(sites, west.flow, 4), -150, -150);
    const downSouth = downwindFromSector(SOUTH);
    const downWest = downwindFromSector(WEST);
    expect(openSouth.dirE * downSouth.east + openSouth.dirN * downSouth.north).toBeGreaterThan(0.97);
    expect(openWest.dirE * downWest.east + openWest.dirN * downWest.north).toBeGreaterThan(0.97);
    expect(openSouth.dirE * openWest.dirE + openSouth.dirN * openWest.dirN).toBeLessThan(0.3);
  });

  it("bends vectors around a building and shortens them in its wake", () => {
    const south = run(createWindPlanSpeedJob(model, "vec:annual", windPlanReferenceMs(weights, SOUTH), SOUTH));
    const vectors = windPlanVectors(windPlanVectorSites(south.geometry, 10), south.flow, 4);
    const down = downwindFromSector(SOUTH);
    const nearBuilding = vectors.filter((v) => Math.max(Math.abs(v.east), Math.abs(v.north)) <= 45);
    const leastAligned = Math.min(...nearBuilding.map((v) => v.dirE * down.east + v.dirN * down.north));
    expect(leastAligned).toBeLessThan(0.95);
    const open = nearest(vectors, -150, -150);
    const wake = nearest(vectors, 0, 60);
    expect(wake.strength).toBeLessThan(open.strength);
  });

  it("frequency-weights the comfort vectors across headings", () => {
    const comfort = run(createWindPlanComfortJob(model, "vec:annual", weights));
    const vectors = windPlanVectors(windPlanVectorSites(comfort.geometry), comfort.flow, 4);
    const open = nearest(vectors, -150, -150);
    const s = downwindFromSector(SOUTH);
    const w = downwindFromSector(WEST);
    const mixE = s.east + w.east;
    const mixN = s.north + w.north;
    const mixLen = Math.hypot(mixE, mixN);
    expect((open.dirE * mixE + open.dirN * mixN) / mixLen).toBeGreaterThan(0.95);
  });

  it("weights each heading's flow by its share of wind", () => {
    const flow: WindPlanFlow = emptyWindPlanFlow(1);
    accumulateSectorFlow(flow, { east: Float32Array.of(1), north: Float32Array.of(0) }, [1], 3, 1);
    accumulateSectorFlow(flow, { east: Float32Array.of(0), north: Float32Array.of(2) }, [1], 1, 1);
    expect(flow.east[0]).toBeCloseTo(3);
    expect(flow.north[0]).toBeCloseTo(1);
    expect(flow.speedMs[0]).toBeCloseTo(4);
  });
});

describe("plan wind vector sizing", () => {
  it("scales length with speed between a visible floor and a cap", () => {
    expect(windPlanVectorLengthPx(0, 40, 18)).toBeCloseTo(18 * WIND_PLAN_VECTOR_MIN_FRACTION);
    expect(windPlanVectorLengthPx(1, 40, 18)).toBeCloseTo(18);
    expect(windPlanVectorLengthPx(5, 40, 18)).toBeCloseTo(18);
    expect(windPlanVectorLengthPx(1, 12, 18)).toBeLessThan(12);
  });

  it("thins the grid when zoomed out so vectors keep a screen gap", () => {
    expect(WIND_PLAN_VECTOR_SPACING_M).toBe(15);
    expect(WIND_PLAN_VECTOR_MIN_GAP_PX).toBe(7);
    expect(windPlanVectorStride(15, 1)).toBe(1);
    expect(windPlanVectorStride(15, 0.5)).toBe(1);
    expect(windPlanVectorStride(15, 0.3)).toBe(2);
    expect(windPlanVectorStride(15, 0.1)).toBe(8);
  });

  it("uses the dark stroke tokens and the smaller 3px head", () => {
    const css = readFileSync(new URL("../drawing-style.css", import.meta.url), "utf8");
    const value = (name: string) => {
      const match = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
      expect(match, name).toBeTruthy();
      return match![1]!.trim();
    };
    expect(value("--wind-plan-vector-stroke").toUpperCase()).toBe("#1A1A1A");
    expect(value("--wind-plan-vector-opacity")).toBe("0.7");
    expect(value("--wind-plan-vector-px")).toBe("1");
    expect(value("--wind-plan-vector-head-px")).toBe("3");
  });
});
