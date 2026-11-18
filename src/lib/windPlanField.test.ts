import { describe, expect, it } from "vitest";
import type { CityModel, Pt } from "../types";
import { WIND_SPEED_BIN_EDGES_MS } from "./windBins";
import {
  accumulateSectorExceedance,
  comfortClassAt,
  emptyComfortFields,
  sectorReferenceSpeedMs,
  windSeasonWeights,
} from "./windComfort";
import { rasterGroundWindObstacles, rasterGroundWindWater } from "./groundWindField";
import type { ColourKey } from "./colours";
import type { WindRoseSeasonRecord } from "./windRoseData";
import {
  bilinearSample,
  boxBlur3,
  buildWindPlanRatio,
  cachedWindPlanSpeed,
  createWindPlanComfortJob,
  createWindPlanSpeedJob,
  fillSolidCells,
  gaussianBlur,
  PEDESTRIAN_HEIGHT_FACTOR,
  pedestrianHeightFactorAt,
  pedestrianHeightFactors,
  powerLawHeightFactor,
  rampRgb,
  WIND_PLAN_SPEED_MAX_MS,
  WIND_PLAN_SPEED_RAMP,
  WATER_PEDESTRIAN_HEIGHT_FACTOR,
  WATER_SHORE_BLEND_M,
  cachedWindPlanScale,
  createWindPlanScaleJob,
  windPlanContourLevels,
  windPlanDisplayField,
  windPlanFieldPercentile,
  windPlanImageUpscale,
  windPlanLegendGradient,
  windPlanLegendStops,
  windPlanOverWater,
  windPlanScaleRatio,
  windPlanSiteFingerprint,
  windPlanSpeedRamp,
  WIND_PLAN_SCALE_PERCENTILE,
  windPlanRampStops,
  windPlanReferenceMs,
  windPlanScaleKey,
  windPlanScaleMaxMs,
  windPlanSiteScaleMaxMs,
  windPlanSpeedKey,
  windPlanSpeedTicks,
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

function withWater(model: CityModel, water: Pt[]): CityModel {
  return { ...model, areas: [{ id: 1, ring: water, holes: [], kind: "water" }] };
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
    const west = run(createWindPlanSpeedJob(model, "test:annual", windPlanReferenceMs(weights, WEST), WEST));
    const lee = at(west.geometry, west.speedMs, 30, 0);
    const windward = at(west.geometry, west.speedMs, -30, 0);
    expect(lee).toBeLessThan(windward * 0.7);

    const east = run(createWindPlanSpeedJob(model, "test:annual", windPlanReferenceMs(weights, EAST), EAST));
    expect(at(east.geometry, east.speedMs, -30, 0)).toBeLessThan(at(east.geometry, east.speedMs, 30, 0) * 0.7);
  });

  it("is in m/s: open ground runs at the direction's reference speed", () => {
    const model = oneBuilding();
    const west = run(createWindPlanSpeedJob(model, "test:annual", windPlanReferenceMs(weights, WEST), WEST));
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
    const speed = run(createWindPlanSpeedJob(model, "house:annual", windPlanReferenceMs(weightsN, north), north));
    expect(at(speed.geometry, speed.speedMs, 0, -14)).toBeLessThan(at(speed.geometry, speed.speedMs, 0, 14));
  });

  it("caches each season and direction once", () => {
    const model = oneBuilding();
    const first = run(createWindPlanSpeedJob(model, "test:annual", windPlanReferenceMs(weights, WEST), WEST));
    expect(cachedWindPlanSpeed(model, windPlanSpeedKey("test:annual", WEST))).toBe(first);
    const again = createWindPlanSpeedJob(model, "test:annual", windPlanReferenceMs(weights, WEST), WEST)!;
    expect(again.result()).toBe(first);
  });

  it("has no field for a direction with no wind", () => {
    expect(createWindPlanSpeedJob(oneBuilding(), "test:annual", windPlanReferenceMs(weights, 0), 0)).toBeNull();
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
    const speed = run(createWindPlanSpeedJob(modelOf(240, []), "height:annual", windPlanReferenceMs(weights, WEST), WEST));
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

describe("wind over water", () => {
  const weights = windSeasonWeights(season({ [WEST]: [0.2, 0.3, 0.1, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
  const halfWater = () => withWater(modelOf(240, []), ring(0, -120, 120, 120));

  it("brings open-water wind down to walking height with a smooth-surface power law", () => {
    expect(WATER_PEDESTRIAN_HEIGHT_FACTOR).toBeCloseTo(powerLawHeightFactor(10, 1.5, 0.11), 9);
    expect(WATER_PEDESTRIAN_HEIGHT_FACTOR).toBeCloseTo(0.8117, 4);
    expect(pedestrianHeightFactorAt(0)).toBe(WATER_PEDESTRIAN_HEIGHT_FACTOR);
    expect(pedestrianHeightFactorAt(WATER_SHORE_BLEND_M)).toBe(PEDESTRIAN_HEIGHT_FACTOR);
    expect(pedestrianHeightFactorAt(500)).toBe(PEDESTRIAN_HEIGHT_FACTOR);
  });

  it("runs about 1.3 times faster over open water than over open land", () => {
    const model = halfWater();
    const speed = run(createWindPlanSpeedJob(model, "water:annual", windPlanReferenceMs(weights, WEST), WEST));
    const land = at(speed.geometry, speed.speedMs, -100, 0);
    const water = at(speed.geometry, speed.speedMs, 100, 0);
    expect(land).toBeCloseTo(speed.referenceMs, 4);
    expect(water / land).toBeCloseTo(WATER_PEDESTRIAN_HEIGHT_FACTOR / PEDESTRIAN_HEIGHT_FACTOR, 3);
    expect(water / land).toBeCloseTo(1.304, 2);
    expect(windPlanOverWater(model)).toBe(true);
  });

  it("blends the boost across the shore, falling steadily with distance inland", () => {
    const model = halfWater();
    const obs = rasterGroundWindObstacles(model);
    const factors = pedestrianHeightFactors(rasterGroundWindWater(model, obs, obs.solid), obs.cols, obs.rows, obs.cellM)!;
    const j = obs.rows >> 1;
    const profile = Array.from({ length: obs.cols }, (_, i) => factors[j * obs.cols + i]!).reverse();
    for (let k = 1; k < profile.length; k++) expect(profile[k]!).toBeLessThanOrEqual(profile[k - 1]!);
    expect(profile[0]).toBeCloseTo(WATER_PEDESTRIAN_HEIGHT_FACTOR, 6);
    expect(profile[profile.length - 1]).toBeCloseTo(PEDESTRIAN_HEIGHT_FACTOR, 6);
    const shoreIdx = j * obs.cols + Math.floor((-WATER_SHORE_BLEND_M / 2 - obs.originE) / obs.cellM);
    expect(factors[shoreIdx]!).toBeGreaterThan(PEDESTRIAN_HEIGHT_FACTOR);
    expect(factors[shoreIdx]!).toBeLessThan(WATER_PEDESTRIAN_HEIGHT_FACTOR);
  });

  it("keeps buildings over water solid and out of the water mask", () => {
    const model = withWater(modelOf(240, [{ ring: ring(40, -10, 60, 10), height: 12 }]), ring(0, -120, 120, 120));
    const obs = rasterGroundWindObstacles(model);
    const water = rasterGroundWindWater(model, obs, obs.solid);
    const idx = Math.floor((0 - obs.originN) / obs.cellM) * obs.cols + Math.floor((50 - obs.originE) / obs.cellM);
    expect(obs.solid[idx]).toBe(1);
    expect(water[idx]).toBe(0);
    expect(water[idx + 10]).toBe(1);
  });

  it("uses the same walking-height factor for comfort", () => {
    const comfortWeights = windSeasonWeights(season({ [WEST]: [0.1, 0.3, 0.4, 0.1, 0] }, 0), WIND_SPEED_BIN_EDGES_MS);
    const comfort = run(createWindPlanComfortJob(halfWater(), "water:annual", comfortWeights));
    const expected = (factor: number) => {
      const one = emptyComfortFields(1, 1);
      accumulateSectorExceedance(one, comfortWeights, WEST, [1], 0, 1, factor);
      return one;
    };
    const land = expected(PEDESTRIAN_HEIGHT_FACTOR);
    const water = expected(WATER_PEDESTRIAN_HEIGHT_FACTOR);
    expect(water.p4[0]!).toBeGreaterThan(land.p4[0]!);
    expect(at(comfort.geometry, comfort.fields.p4, -100, 0)).toBeCloseTo(land.p4[0]!, 4);
    expect(at(comfort.geometry, comfort.fields.p4, 100, 0)).toBeCloseTo(water.p4[0]!, 4);
    expect(at(comfort.geometry, comfort.fields.p6, 100, 0)).toBeCloseTo(water.p6[0]!, 4);
  });

  it("leaves a site with no water exactly as before", () => {
    const model = scatteredHouses(300, 120, 7);
    const speed = run(createWindPlanSpeedJob(model, "dry:annual", windPlanReferenceMs(weights, WEST), WEST));
    const { geometry, ratio } = buildWindPlanRatio(model, WEST);
    expect(Array.from(speed.speedMs)).toEqual(Array.from(windPlanDisplayField(ratio, geometry, speed.referenceMs)));
    expect(windPlanOverWater(model)).toBe(false);
    expect(cachedWindPlanSpeed(model, windPlanSpeedKey("dry:annual", WEST))).toBe(speed);

    const comfort = run(createWindPlanComfortJob(model, "dry:annual", weights));
    const expected = emptyComfortFields(geometry.cols, geometry.rows);
    accumulateSectorExceedance(expected, weights, WEST, ratio, 0, ratio.length, PEDESTRIAN_HEIGHT_FACTOR);
    for (let idx = 0; idx < ratio.length; idx++) {
      if (geometry.solid[idx]) continue;
      expect(comfort.fields.p4[idx]).toBe(expected.p4[idx]);
    }
  });

  it("shows a wake over water in the lee of a shoreline building, slower than open water", () => {
    const model = withWater(modelOf(240, [{ ring: ring(-30, -15, -5, 15), height: 20 }]), ring(0, -120, 120, 120));
    const speed = run(createWindPlanSpeedJob(model, "water:wake", windPlanReferenceMs(weights, WEST), WEST));
    const lee = at(speed.geometry, speed.speedMs, 15, 0);
    const open = at(speed.geometry, speed.speedMs, 15, 80);
    expect(lee).toBeLessThan(open * 0.85);
    const shore = at(speed.geometry, speed.speedMs, -40, 80);
    const inland = at(speed.geometry, speed.speedMs, -100, 80);
    expect(shore).toBeGreaterThan(inland);
    expect(open).toBeGreaterThan(shore);
  });

  it("keeps cached water fields apart from dry ones for the same season", () => {
    const model = halfWater();
    const speed = run(createWindPlanSpeedJob(model, "water:annual", windPlanReferenceMs(weights, WEST), WEST));
    expect(cachedWindPlanSpeed(model, windPlanSpeedKey("water:annual", WEST))).toBe(speed);
    expect(speed.key).toBe(windPlanSpeedKey("water:annual", WEST));
  });
});

describe("wind plan field edges", () => {
  it("keeps a uniform open field uniform to the edge with no unsafe area", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0.3, 0.3, 0.2, 0.1, 0.0005], [EAST]: [0.05, 0.05, 0, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
    const model = modelOf(300, []);
    const comfort = run(createWindPlanComfortJob(model, "open:annual", weights));
    expect(comfort.unsafeAreas).toHaveLength(0);
    for (const field of [comfort.fields.p4, comfort.fields.p6, comfort.fields.p8, comfort.fields.p10, comfort.fields.p15]) {
      expect(Math.max(...field) - Math.min(...field)).toBeLessThan(1e-6);
    }
    const speed = run(createWindPlanSpeedJob(model, "open:annual", windPlanReferenceMs(weights, WEST), WEST));
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

  it("uses 0 to 4 m/s as the smallest scale, with ticks every 1 m/s and isolines every 0.25 m/s", () => {
    expect(WIND_PLAN_SPEED_MAX_MS).toBe(4);
    expect(windPlanContourLevels(WIND_PLAN_SPEED_MAX_MS)).toEqual([
      0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75,
    ]);
    expect(windPlanSpeedTicks(WIND_PLAN_SPEED_MAX_MS)).toEqual([0, 1, 2, 3, 4]);
  });

  it("uses its own plan speed tokens, not the 3D ground-wind ramp", () => {
    expect(WIND_PLAN_SPEED_RAMP.map((stop) => stop.ms)).toEqual([0, 1, 2, 2.8, 3.5, 4]);
    for (const stop of WIND_PLAN_SPEED_RAMP) expect(stop.token.startsWith("--wind-plan-speed-")).toBe(true);
  });

  it("samples the speed field bilinearly between cell centres and clamps at the edges", () => {
    const values = [0, 4, 2, 6];
    expect(bilinearSample(values, 2, 2, 0, 0)).toBe(0);
    expect(bilinearSample(values, 2, 2, 0.5, 0)).toBe(2);
    expect(bilinearSample(values, 2, 2, 0.5, 0.5)).toBe(3);
    expect(bilinearSample(values, 2, 2, 0.25, 1)).toBe(3);
    expect(bilinearSample(values, 2, 2, -3, 9)).toBe(2);
    expect(bilinearSample(values, 2, 2, 5, -1)).toBe(4);
  });

  it("paints the speed image at four times the grid unless that gets too large", () => {
    expect(windPlanImageUpscale(300, 300)).toBe(4);
    expect(windPlanImageUpscale(800, 800)).toBe(2);
    expect(windPlanImageUpscale(5000, 5000)).toBe(1);
  });

  it("maps 0 m/s to the first ramp colour and 4 m/s or more to the last", () => {
    let n = 0;
    const stops = windPlanRampStops(() => {
      n += 1;
      return { r: n, g: n * 2, b: n * 3 };
    });
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    expect(first.ms).toBe(0);
    expect(last.ms).toBe(4);
    const out: [number, number, number] = [0, 0, 0];
    expect(rampRgb(stops, 0, out)).toEqual(first.rgb);
    expect(rampRgb(stops, 4, out)).toEqual(last.rgb);
    expect(rampRgb(stops, 7.5, out)).toEqual(last.rgb);
  });
});

describe("wind plan site speed scale", () => {
  it("keeps a light-wind suburban site on 0 to 4 m/s", () => {
    expect(windPlanScaleMaxMs(2.6)).toBe(4);
    expect(windPlanScaleMaxMs(4)).toBe(4);
    expect(windPlanSiteScaleMaxMs([2.1, 3.4, 3.9])).toBe(4);
  });

  it("rounds a harbour site's peak up to a nice top", () => {
    expect(windPlanScaleMaxMs(4.2)).toBe(5);
    expect(windPlanScaleMaxMs(5.5)).toBe(6);
    for (const peak of [6.8, 7.2, 7.9, 8]) expect(windPlanScaleMaxMs(peak)).toBe(8);
    expect(windPlanScaleMaxMs(8.1)).toBe(10);
  });

  it("falls back to 4 m/s when there is no usable peak", () => {
    expect(windPlanScaleMaxMs(NaN)).toBe(4);
    expect(windPlanScaleMaxMs(Infinity)).toBe(4);
    expect(windPlanSiteScaleMaxMs([])).toBe(4);
  });

  it("gives every season and design wind at one site the same top", () => {
    const viewPeaks = { annual: 3.2, summer: 3.1, autumn: 3.3, winter: 2.8, spring: 3.6, ne: 6.1, s: 7.4, w: 5.2 };
    const top = windPlanSiteScaleMaxMs(Object.values(viewPeaks));
    expect(top).toBe(8);
    expect(windPlanScaleMaxMs(viewPeaks.summer)).toBe(4);
    expect(windPlanScaleMaxMs(viewPeaks.w)).toBe(6);
  });

  it("spaces ticks and isolines to suit the top", () => {
    expect(windPlanSpeedTicks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(windPlanSpeedTicks(6)).toEqual([0, 2, 4, 6]);
    expect(windPlanSpeedTicks(8)).toEqual([0, 2, 4, 6, 8]);
    expect(windPlanSpeedTicks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    const at8 = windPlanContourLevels(8);
    expect(at8).toHaveLength(15);
    expect(at8[0]).toBe(0.5);
    expect(at8[at8.length - 1]).toBe(7.5);
    expect(windPlanContourLevels(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("stretches the ramp across the site scale so mid-scale stays cyan", () => {
    const rgb = (token: string) => {
      const k = WIND_PLAN_SPEED_RAMP.findIndex((stop) => stop.token === token);
      return { r: k, g: k, b: k };
    };
    const stops = windPlanRampStops(rgb, 8);
    expect(stops.map((stop) => stop.ms)).toEqual([0, 2, 4, 5.6, 7, 8]);
    const out: [number, number, number] = [0, 0, 0];
    expect(rampRgb(stops, 4, out)).toEqual([2, 2, 2]);
    expect(rampRgb(stops, 8, out)).toEqual(stops[stops.length - 1]!.rgb);
    expect(rampRgb(stops, 11, out)).toEqual(stops[stops.length - 1]!.rgb);
  });

  it("sizes the scale from the high percentile of the strongest painted view and caches it per site", () => {
    const model = withWater(oneBuilding(), ring(-120, -120, 120, -40));
    const views = [
      { sector: WEST, referenceMs: 2 },
      { sector: EAST, referenceMs: 3 },
      { sector: WEST, referenceMs: 5.5 },
    ];
    const top = run(createWindPlanScaleJob(model, views));
    const strongest = run(createWindPlanSpeedJob(model, "scale:design-w", 5.5, WEST));
    const painted = windPlanFieldPercentile(strongest.speedMs, strongest.geometry.solid, WIND_PLAN_SCALE_PERCENTILE);
    expect(top).toBeGreaterThan(4);
    expect(top).toBe(windPlanScaleMaxMs(painted));
    expect(cachedWindPlanScale(model, windPlanScaleKey(views))).toBe(top);
    expect(cachedWindPlanScale(model, windPlanScaleKey(views.slice(0, 2)))).toBeNull();
  });

  it("does not let one fast cell lift the top from 8 to 10", () => {
    const values = new Float32Array(2000).fill(7.4);
    for (let idx = 0; idx < values.length; idx += 7) values[idx] = 6.2;
    values[123] = 8.6;
    const solid = new Uint8Array(values.length);
    expect(windPlanScaleMaxMs(Math.max(...values))).toBe(10);
    expect(windPlanScaleMaxMs(windPlanFieldPercentile(values, solid, WIND_PLAN_SCALE_PERCENTILE))).toBe(8);
  });

  it("takes the percentile over open cells only", () => {
    const values = Float32Array.from([1, 2, 3, 4, 50]);
    expect(windPlanFieldPercentile(values, Uint8Array.from([0, 0, 0, 0, 1]), 1)).toBe(4);
    expect(windPlanFieldPercentile(values, Uint8Array.from([1, 1, 1, 1, 1]), 1)).toBeNaN();
  });

  it("gives the same complete site the same top, whatever loaded before it", () => {
    const complete = () => withWater(modelOf(240, [{ ring: ring(-12, -12, 12, 12), height: 20 }, { ring: ring(30, 30, 50, 60), height: 35 }]), ring(-120, -120, 120, -40));
    const partial = withWater(oneBuilding(), ring(-120, -120, 120, -40));
    const views = [
      { sector: WEST, referenceMs: 3.1 },
      { sector: EAST, referenceMs: 4.4 },
    ];
    const first = complete();
    const firstTop = run(createWindPlanScaleJob(first, views));
    run(createWindPlanScaleJob(partial, views));
    const again = complete();
    expect(again).not.toBe(first);
    expect(cachedWindPlanScale(again, windPlanScaleKey(views))).toBeNull();
    const job = createWindPlanScaleJob(again, views);
    expect(job.step(Infinity)).toBe(true);
    expect(job.result()).toBe(firstTop);
    expect(cachedWindPlanScale(again, windPlanScaleKey(views))).toBe(firstTop);
  });

  it("fingerprints the obstacle and water geometry so a partial site never reuses a complete one", () => {
    const print = (model: CityModel) => {
      const obs = rasterGroundWindObstacles(model);
      return windPlanSiteFingerprint(obs, rasterGroundWindWater(model, obs, obs.solid));
    };
    const water = ring(-120, -120, 120, -40);
    const full = withWater(modelOf(240, [{ ring: ring(-12, -12, 12, 12), height: 20 }, { ring: ring(30, 30, 50, 60), height: 35 }]), water);
    expect(print(full)).toBe(print(withWater(modelOf(240, [{ ring: ring(-12, -12, 12, 12), height: 20 }, { ring: ring(30, 30, 50, 60), height: 35 }]), water)));
    expect(print(full)).not.toBe(print(withWater(oneBuilding(), water)));
    expect(print(full)).not.toBe(print(modelOf(240, [{ ring: ring(-12, -12, 12, 12), height: 20 }, { ring: ring(30, 30, 50, 60), height: 35 }])));
    expect(print(full)).not.toBe(print(withWater(modelOf(240, [{ ring: ring(-12, -12, 12, 12), height: 21 }, { ring: ring(30, 30, 50, 60), height: 35 }]), water)));
  });

  it("scales from the painted field, not the raw solver ratio", () => {
    const model = withWater(oneBuilding(), ring(-120, -120, 120, -40));
    const { geometry, ratio } = buildWindPlanRatio(model, WEST);
    const obs = rasterGroundWindObstacles(model);
    const factors = pedestrianHeightFactors(rasterGroundWindWater(model, obs, obs.solid), obs.cols, obs.rows, obs.cellM);
    const display = windPlanDisplayField(ratio, geometry, 1, factors);
    expect(windPlanScaleRatio(ratio, geometry, factors)).toBe(windPlanFieldPercentile(display, geometry.solid, WIND_PLAN_SCALE_PERCENTILE));
  });
});

describe("wind plan velocity legend", () => {
  const colourOf = (token: ColourKey) => `var(${token})`;

  it("paints one left-to-right gradient", () => {
    const gradient = windPlanLegendGradient(colourOf, 8);
    expect(gradient.startsWith("linear-gradient(to right, ")).toBe(true);
    expect(gradient).not.toContain("to top");
  });

  it("uses the map ramp's tokens at the map ramp's positions for every site top", () => {
    for (const top of [4, 5, 6, 8, 10, 12]) {
      const ramp = windPlanSpeedRamp(top);
      const legend = windPlanLegendStops(top);
      expect(legend.map((stop) => stop.token)).toEqual(ramp.map((stop) => stop.token));
      legend.forEach((stop, k) => expect(stop.pct).toBeCloseTo((ramp[k]!.ms / top) * 100, 9));
      const rgb = (token: ColourKey) => ({ r: WIND_PLAN_SPEED_RAMP.findIndex((s) => s.token === token), g: 0, b: 0 });
      expect(windPlanRampStops(rgb, top).map((stop) => (stop.ms / top) * 100)).toEqual(legend.map((stop) => stop.pct));
    }
    expect(windPlanLegendStops(8).map((stop) => stop.pct)).toEqual([0, 25, 50, 70, 87.5, 100]);
    expect(windPlanLegendGradient(colourOf, 8)).toBe(
      "linear-gradient(to right, var(--wind-plan-speed-still) 0%, var(--wind-plan-speed-calm) 25%, var(--wind-plan-speed-breeze) 50%, var(--wind-plan-speed-brisk) 70%, var(--wind-plan-speed-strong) 87.5%, var(--wind-plan-speed-fast) 100%)",
    );
  });
});
