import { describe, expect, it } from "vitest";
import type { CityModel, Pt } from "../types";
import { WIND_SPEED_BIN_EDGES_MS } from "./windBins";
import { comfortClassAt, sectorReferenceSpeedMs, windSeasonWeights } from "./windComfort";
import type { WindRoseSeasonRecord } from "./windRoseData";
import {
  boxBlur3,
  buildWindPlanRatio,
  cachedWindPlanSpeed,
  createWindPlanComfortJob,
  createWindPlanSpeedJob,
  fillSolidCells,
  gaussianBlur,
  PEDESTRIAN_HEIGHT_FACTOR,
  powerLawHeightFactor,
  rampRgb,
  windPlanReferenceMs,
  windPlanSpeedKey,
  type WindPlanGeometry,
  type WindPlanJob,
} from "./windPlanField";

const WEST = 12;
const EAST = 4;

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

type Box = { ring: Pt[]; height: number };

function modelOf(sideM: number, boxes: Box[]): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: boxes.map((box, k) => ({ id: k + 1, ring: box.ring, holes: [], height: box.height, use: "residential", source: "osm_tag" })),
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

function oneBuilding(): CityModel {
  return modelOf(240, [{ ring: ring(-12, -12, 12, 12), height: 20 }]);
}

function scatteredHouses(sideM: number, count: number, seed: number): CityModel {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const half = sideM / 2;
  const boxes: Box[] = [];
  for (let k = 0; k < count; k++) {
    const cx = (random() - 0.5) * sideM;
    const cy = (random() - 0.5) * sideM;
    const w = 8 + random() * 10;
    const h = 8 + random() * 12;
    const x0 = Math.max(-half, cx - w / 2);
    const x1 = Math.min(half, cx + w / 2);
    const y0 = Math.max(-half, cy - h / 2);
    const y1 = Math.min(half, cy + h / 2);
    boxes.push({ ring: ring(x0, y0, x1, y1), height: 5 + random() * 4 });
  }
  return modelOf(sideM, boxes);
}

function season(sectorBins: Record<number, number[]>, calmPct = 10): WindRoseSeasonRecord {
  const sectors = Array.from({ length: 16 }, (_, s) => sectorBins[s] ?? [0, 0, 0, 0, 0]);
  return { calmPct, prevailingDirDeg: 0, meanSpeedMs: 3, sectors };
}

function run<T>(job: WindPlanJob<T> | null): T {
  expect(job).not.toBeNull();
  let guard = 0;
  while (!job!.step(1)) {
    guard += 1;
    if (guard > 100_000) throw new Error("job never finished");
  }
  return job!.result()!;
}

function at(geometry: WindPlanGeometry, values: Float32Array, east: number, north: number): number {
  const i = Math.floor((east - geometry.originE) / geometry.cellM);
  const j = Math.floor((north - geometry.originN) / geometry.cellM);
  return values[j * geometry.cols + i]!;
}

describe("wind plan speed field", () => {
  const weights = windSeasonWeights(season({ [WEST]: [0.2, 0.3, 0.1, 0, 0], [EAST]: [0.2, 0.1, 0, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);

  it("is slower in the lee of a building than upwind, and flips with the direction", () => {
    const model = oneBuilding();
    const west = run(createWindPlanSpeedJob(model, "test:annual", weights, WEST));
    const lee = at(west.geometry, west.speedMs, 30, 0);
    const windward = at(west.geometry, west.speedMs, -30, 0);
    expect(lee).toBeLessThan(windward * 0.7);

    const east = run(createWindPlanSpeedJob(model, "test:annual", weights, EAST));
    expect(at(east.geometry, east.speedMs, -30, 0)).toBeLessThan(at(east.geometry, east.speedMs, 30, 0) * 0.7);
  });

  it("is in m/s: open ground runs at the direction's reference speed", () => {
    const model = oneBuilding();
    const west = run(createWindPlanSpeedJob(model, "test:annual", weights, WEST));
    expect(at(west.geometry, west.speedMs, -110, 100)).toBeCloseTo(west.referenceMs, 1);
  });

  it("puts the wake of a house on its lee side, longer than the slow zone upwind", () => {
    const model = modelOf(240, [{ ring: ring(-6, -6, 6, 6), height: 6 }]);
    const north = 0;
    const { geometry, ratio } = buildWindPlanRatio(model, north);
    const slowRun = (step: number) => {
      let run = 0;
      for (let n = 6 + geometry.cellM / 2; n < 100; n += geometry.cellM) {
        if (at(geometry, ratio, 0, n * step) >= 0.7) break;
        run += geometry.cellM;
      }
      return run;
    };
    const wake = slowRun(-1);
    const upwind = slowRun(1);
    expect(wake).toBeGreaterThan(upwind);
    expect(at(geometry, ratio, 0, -12)).toBeLessThan(at(geometry, ratio, 0, 12));

    const weightsN = windSeasonWeights(season({ [north]: [0.2, 0.3, 0.1, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
    const speed = run(createWindPlanSpeedJob(model, "house:annual", weightsN, north));
    expect(at(speed.geometry, speed.speedMs, 0, -14)).toBeLessThan(at(speed.geometry, speed.speedMs, 0, 14));
  });

  it("caches each season and direction once", () => {
    const model = oneBuilding();
    const first = run(createWindPlanSpeedJob(model, "test:annual", weights, WEST));
    expect(cachedWindPlanSpeed(model, windPlanSpeedKey("test:annual", WEST))).toBe(first);
    const again = createWindPlanSpeedJob(model, "test:annual", weights, WEST)!;
    expect(again.result()).toBe(first);
  });

  it("has no field for a direction with no wind", () => {
    expect(createWindPlanSpeedJob(oneBuilding(), "test:annual", weights, 0)).toBeNull();
  });
});

describe("pedestrian height", () => {
  it("takes the 10 m station speed to 1.5 m with a suburban power law", () => {
    expect(powerLawHeightFactor(10, 1.5, 0.25)).toBeCloseTo(0.6223, 4);
    expect(PEDESTRIAN_HEIGHT_FACTOR).toBeCloseTo(0.6223, 4);
    expect(powerLawHeightFactor(10, 10, 0.25)).toBe(1);
  });

  it("scales the reference speed and the open-ground speed map", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0.2, 0.3, 0.1, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
    const station = sectorReferenceSpeedMs(weights, WEST)!;
    expect(windPlanReferenceMs(weights, WEST)).toBeCloseTo(station * PEDESTRIAN_HEIGHT_FACTOR, 6);
    const speed = run(createWindPlanSpeedJob(modelOf(240, []), "height:annual", weights, WEST));
    expect(speed.referenceMs).toBeCloseTo(station * PEDESTRIAN_HEIGHT_FACTOR, 6);
    expect(at(speed.geometry, speed.speedMs, 0, 0)).toBeCloseTo(station * PEDESTRIAN_HEIGHT_FACTOR, 4);
  });

  it("classes comfort on the pedestrian-height speed", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0, 0, 1, 0, 0] }, 0), WIND_SPEED_BIN_EDGES_MS);
    const comfort = run(createWindPlanComfortJob(modelOf(240, []), "height:annual", weights));
    const centre = (comfort.geometry.rows >> 1) * comfort.geometry.cols + (comfort.geometry.cols >> 1);
    expect(comfort.fields.p6[centre]).toBe(0);
    expect(comfortClassAt(comfort.fields, centre)).toBe("standing");
  });
});

describe("wind plan field edges", () => {
  it("keeps a uniform open field uniform to the edge with no unsafe area", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0.3, 0.3, 0.2, 0.1, 0.0005], [EAST]: [0.05, 0.05, 0, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
    const model = modelOf(300, []);
    const comfort = run(createWindPlanComfortJob(model, "open:annual", weights));
    expect(comfort.unsafeAreas).toHaveLength(0);
    for (const field of [comfort.fields.p4, comfort.fields.p6, comfort.fields.p10, comfort.fields.p15]) {
      expect(Math.max(...field) - Math.min(...field)).toBeLessThan(1e-6);
    }
    const speed = run(createWindPlanSpeedJob(model, "open:annual", weights, WEST));
    expect(Math.max(...speed.speedMs) - Math.min(...speed.speedMs)).toBeLessThan(1e-4);
  });

  it("gives cells along the upwind cut edge the same shelter as the interior", () => {
    const model = scatteredHouses(400, 260, 3);
    const upwindBand: Record<number, (i: number, j: number, cols: number, rows: number) => boolean> = {
      0: (_i, j, _c, rows) => j >= rows - 6,
      4: (i, _j, cols) => i >= cols - 6,
      8: (_i, j) => j < 6,
      12: (i) => i < 6,
    };
    for (const [sector, inBand] of Object.entries(upwindBand)) {
      const { geometry, ratio } = buildWindPlanRatio(model, Number(sector));
      const { cols, rows, solid } = geometry;
      const edge = { sum: 0, n: 0, fast: 0 };
      const inner = { sum: 0, n: 0, fast: 0 };
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const idx = j * cols + i;
          if (solid[idx]) continue;
          const interior = Math.min(i, j, cols - 1 - i, rows - 1 - j) >= 10;
          const tally = inBand(i, j, cols, rows) ? edge : interior ? inner : null;
          if (!tally) continue;
          tally.sum += ratio[idx]!;
          tally.n += 1;
          if (ratio[idx]! > 1.25) tally.fast += 1;
        }
      }
      expect(Math.abs(edge.sum / edge.n - inner.sum / inner.n)).toBeLessThan(0.1);
      expect(edge.fast / edge.n).toBeLessThan(Math.max(0.003, (inner.fast / inner.n) * 2));
    }
  });
});

describe("wind plan comfort field", () => {
  it("finds no unsafe area in light wind", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0.5, 0.4, 0, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
    const comfort = run(createWindPlanComfortJob(oneBuilding(), "light:annual", weights));
    expect(comfort.unsafeAreas).toHaveLength(0);
    expect(Math.max(...comfort.fields.p15)).toBe(0);
  });

  it("flags open ground as unsafe in a gale and keeps the lee calmer", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0, 0, 0, 0, 0.9] }), WIND_SPEED_BIN_EDGES_MS);
    const comfort = run(createWindPlanComfortJob(oneBuilding(), "gale:annual", weights));
    expect(comfort.unsafeAreas.length).toBeGreaterThan(0);
    const { geometry, fields } = comfort;
    expect(at(geometry, fields.p15, 30, 0)).toBeLessThan(at(geometry, fields.p15, -30, 0));
    expect(at(geometry, fields.p15, 0, 0)).toBe(0);
  });
});

describe("field helpers", () => {
  it("fills building cells from their open neighbours", () => {
    const values = Float32Array.from([1, 0, 3]);
    const solid = Uint8Array.from([0, 1, 0]);
    expect(Array.from(fillSolidCells(values, solid, 3, 1, 1))).toEqual([1, 2, 3]);
  });

  it("keeps a flat field flat when blurred", () => {
    const flat = new Float32Array(25).fill(2);
    expect(Array.from(boxBlur3(flat, 5, 5)).every((v) => Math.abs(v - 2) < 1e-6)).toBe(true);
    expect(Array.from(gaussianBlur(flat, 5, 5, 2)).every((v) => Math.abs(v - 2) < 1e-6)).toBe(true);
  });

  it("smooths an isolated speck while keeping its total", () => {
    const cols = 21;
    const speck = new Float32Array(cols * cols);
    speck[10 * cols + 10] = 1;
    const smooth = gaussianBlur(speck, cols, cols, 2);
    expect(smooth[10 * cols + 10]!).toBeLessThan(0.05);
    expect(smooth.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });

  it("maps m/s onto the ramp and clamps at the ends", () => {
    const stops = [
      { ms: 0, rgb: [0, 0, 0] as [number, number, number] },
      { ms: 6, rgb: [60, 120, 240] as [number, number, number] },
    ];
    const out: [number, number, number] = [0, 0, 0];
    expect(rampRgb(stops, 3, out)).toEqual([30, 60, 120]);
    expect(rampRgb(stops, 9, out)).toEqual([60, 120, 240]);
    expect(rampRgb(stops, -1, out)).toEqual([0, 0, 0]);
  });
});
