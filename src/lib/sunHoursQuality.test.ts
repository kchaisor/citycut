import { describe, expect, it } from "vitest";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import { computeSunHoursGroundGrid, sampleSunHoursGroundCell } from "./sunHoursGroundPlan";
import { directSunHoursAtSamples } from "./sunHoursDirectAssess";
import { directSunHoursSampleSet, directSunHoursSamplesForModel, type DirectSunHoursSample } from "./sunHoursDirectSample";
import {
  FAST_SUN_HOURS_PARAMS,
  SUN_HOURS_FAST_WALL_SAMPLE_CAP,
  SUN_HOURS_HIGH_ROOF_SAMPLE_CAP,
  SUN_HOURS_HIGH_WALL_SAMPLE_CAP,
  SUN_HOURS_MAX_WALL_CELL_M,
  sunHoursGroundCellCount,
  sunHoursQualityParams,
} from "./sunHoursQuality";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };
const WINTER = [2026, 6, 21] as const;
const BOX = { minE: -10, maxE: 10, minN: -10, maxN: 10, height: 24 };

function boxModel(sideM = 120): CityModel {
  const building: BuildingFeat = {
    id: 1,
    ring: [
      [BOX.minE, BOX.minN],
      [BOX.maxE, BOX.minN],
      [BOX.maxE, BOX.maxN],
      [BOX.minE, BOX.maxN],
      [BOX.minE, BOX.minN],
    ],
    holes: [],
    height: BOX.height,
    use: "commercial",
    source: "none",
  };
  return {
    placeLabel: "Test",
    center: at,
    sideM,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings: [building],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function denseModel(sideM: number): CityModel {
  const pitchM = 25;
  const halfM = 10;
  const perSide = sideM / pitchM;
  const buildings: BuildingFeat[] = [];
  for (let col = 0; col < perSide; col++) {
    for (let row = 0; row < perSide; row++) {
      const east = -sideM / 2 + pitchM / 2 + col * pitchM;
      const north = -sideM / 2 + pitchM / 2 + row * pitchM;
      buildings.push({
        id: buildings.length + 1,
        ring: [
          [east - halfM, north - halfM],
          [east + halfM, north - halfM],
          [east + halfM, north + halfM],
          [east - halfM, north + halfM],
          [east - halfM, north - halfM],
        ],
        holes: [],
        height: 30,
        use: "commercial",
        source: "none",
      });
    }
  }
  return { ...boxModel(sideM), buildings };
}

function sampleCounts(samples: DirectSunHoursSample[]): { roofs: number; walls: number } {
  const roofs = samples.filter((sample) => sample.kind === "roof-cell").length;
  return { roofs, walls: samples.length - roofs };
}

function rayHitsBox(east: number, north: number, up: number, dirE: number, dirN: number, dirUp: number): boolean {
  let tMin = 1e-6;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [east, dirE, BOX.minE, BOX.maxE],
    [north, dirN, BOX.minN, BOX.maxN],
    [up, dirUp, 0, BOX.height],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-12) {
      if (origin < lo || origin > hi) return false;
      continue;
    }
    const t0 = (lo - origin) / dir;
    const t1 = (hi - origin) / dir;
    tMin = Math.max(tMin, Math.min(t0, t1));
    tMax = Math.min(tMax, Math.max(t0, t1));
  }
  return tMin <= tMax;
}

function bruteForceGroundHours(east: number, north: number): number {
  const window = daylightWindowMinutes(at.lat, at.lon, ...WINTER)!;
  let litMinutes = 0;
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += 1) {
    const sun = sunAtMelbourneLocal(at.lat, at.lon, ...WINTER, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
    if (!sun.aboveHorizon) continue;
    const [x, y, z] = sun.direction;
    if (!rayHitsBox(east, north, 0, x, -z, y)) litMinutes += 1;
  }
  return litMinutes / 60;
}

function groundHours(cellM: number, stepMinutes: number, east: number, north: number): number {
  const grid = computeSunHoursGroundGrid(boxModel(), ...WINTER, cellM, stepMinutes)!;
  const cell = sampleSunHoursGroundCell(grid, east, north);
  expect(cell.masked).toBe(false);
  return cell.hours;
}

function nearestSample(
  samples: DirectSunHoursSample[],
  kind: DirectSunHoursSample["kind"],
  east: number,
  north: number,
  yM?: number,
): number {
  let best = -1;
  let bestDist = Infinity;
  samples.forEach((sample, index) => {
    if (sample.kind !== kind) return;
    const dist = Math.hypot(sample.east - east, sample.north - north, yM === undefined ? 0 : sample.yM - yM);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

describe("sunHoursQualityParams", () => {
  it("Fast is the 3 m grid with 15-minute steps and the original wall cap", () => {
    const fast = sunHoursQualityParams("fast", 1000);
    expect(fast.cellM).toBe(3);
    expect(fast.stepMinutes).toBe(15);
    expect(fast.degraded).toBe(false);
    expect(fast.wallSampleCap).toBe(SUN_HOURS_FAST_WALL_SAMPLE_CAP);
    expect(fast.wallCellM).toBe(3);
    expect(fast.denseCutWallCellM).toBe(6);
    expect(FAST_SUN_HOURS_PARAMS).toEqual(sunHoursQualityParams("fast", 250));
  });

  it("High is a 1 m grid with 5-minute steps up to a 0.5 km cut", () => {
    for (const sideM of [120, 250, 500]) {
      const high = sunHoursQualityParams("high", sideM);
      expect(high.cellM).toBe(1);
      expect(high.stepMinutes).toBe(5);
      expect(high.degraded).toBe(false);
    }
    expect(sunHoursGroundCellCount(500, 1)).toBe(250_000);
  });

  it("High eases the grid for bigger cuts and keeps the 5-minute step", () => {
    const mid = sunHoursQualityParams("high", 700);
    expect(mid.cellM).toBe(1.5);
    expect(mid.degraded).toBe(true);
    const km = sunHoursQualityParams("high", 1000);
    expect(km.cellM).toBe(2);
    expect(km.stepMinutes).toBe(5);
    expect(km.degraded).toBe(true);
    expect(km.targetCellM).toBe(1);
    expect(sunHoursGroundCellCount(1000, km.cellM)).toBeLessThanOrEqual(250_000);
    expect(sunHoursQualityParams("high", 1500).cellM).toBe(2);
  });

  it("High raises the wall cap and samples walls and roofs on its own grid", () => {
    const high = sunHoursQualityParams("high", 120);
    expect(high.wallSampleCap).toBeGreaterThan(SUN_HOURS_FAST_WALL_SAMPLE_CAP);
    expect(high.wallSampleCap).toBe(SUN_HOURS_HIGH_WALL_SAMPLE_CAP);
    const highSet = directSunHoursSampleSet(boxModel(), high);
    const fastSet = directSunHoursSampleSet(boxModel(), FAST_SUN_HOURS_PARAMS);
    expect(highSet.wallCellM).toBe(1);
    expect(highSet.roofCellM).toBe(1);
    expect(fastSet.wallCellM).toBe(3);
    expect(fastSet.roofCellM).toBe(3);
    expect(highSet.samples.filter((sample) => sample.kind === "roof-cell")).toHaveLength(400);
    expect(highSet.samples.length).toBeGreaterThan(fastSet.samples.length * 5);
  });

  it("High coarsens walls under a tight cap without dropping the roof grid", () => {
    const high = { ...sunHoursQualityParams("high", 120), wallSampleCap: 100 };
    const set = directSunHoursSampleSet(boxModel(), high);
    expect(set.wallCellM).toBeGreaterThan(1);
    expect(set.samples.filter((sample) => sample.kind === "facade-bay").length).toBeLessThanOrEqual(100);
    expect(set.roofCellM).toBe(1);
    expect(set.samples.find((sample) => sample.kind === "roof-cell")!.spanM).toBe(1);
  });

  it("High coarsens roofs under a tight cap without touching the ground grid or the walls", () => {
    const high = sunHoursQualityParams("high", 120);
    const tight = { ...high, roofSampleCap: 100 };
    const set = directSunHoursSampleSet(boxModel(), tight);
    const roofs = set.samples.filter((sample) => sample.kind === "roof-cell");
    expect(set.roofCellM).toBe(2);
    expect(roofs).toHaveLength(100);
    expect(roofs.every((sample) => sample.spanM === 2)).toBe(true);
    expect(set.wallCellM).toBe(1);
    expect(tight.cellM).toBe(1);
    expect(sampleCounts(set.samples).walls).toBe(sampleCounts(directSunHoursSampleSet(boxModel(), high).samples).walls);
  });

  it("High roofs stop coarsening at the wall ceiling and every building keeps a roof sample", () => {
    const model = denseModel(250);
    const set = directSunHoursSampleSet(model, { ...sunHoursQualityParams("high", 250), roofSampleCap: 1 });
    expect(set.roofCellM).toBe(SUN_HOURS_MAX_WALL_CELL_M);
    const roofed = new Set(set.samples.filter((sample) => sample.kind === "roof-cell").map((sample) => sample.buildingId));
    expect(roofed.size).toBe(model.buildings.length);
  });

  it("Fast has no roof cap", () => {
    expect(sunHoursQualityParams("fast", 1000).roofSampleCap).toBe(Infinity);
  });
});

describe("High surface sample budget on dense cuts", () => {
  const cuts = [
    { sideM: 500, buildings: 400, fast: { roofs: 19_600, walls: 32_000, wallCellM: 6 }, highStartCellM: 1 },
    { sideM: 1000, buildings: 1600, fast: { roofs: 78_400, walls: 38_400, wallCellM: 12 }, highStartCellM: 2 },
  ];

  for (const { sideM, buildings, fast, highStartCellM } of cuts) {
    it(`${sideM} m cut: High roofs and walls fit their caps and Fast is unchanged`, () => {
      const model = denseModel(sideM);
      expect(model.buildings).toHaveLength(buildings);

      const high = sunHoursQualityParams("high", sideM);
      expect(high.cellM).toBe(highStartCellM);
      const highSet = directSunHoursSampleSet(model, high);
      const highCounts = sampleCounts(highSet.samples);
      expect(highCounts.roofs).toBeLessThanOrEqual(SUN_HOURS_HIGH_ROOF_SAMPLE_CAP);
      expect(highCounts.walls).toBeLessThanOrEqual(SUN_HOURS_HIGH_WALL_SAMPLE_CAP);
      expect(highSet.samples.length).toBeLessThanOrEqual(80_000);
      expect(highSet.roofCellM).toBeGreaterThan(highStartCellM);
      expect(highSet.roofCellM).toBeLessThanOrEqual(SUN_HOURS_MAX_WALL_CELL_M);
      expect(highCounts.roofs).toBeGreaterThanOrEqual(buildings);
      expect(highCounts.walls).toBeGreaterThan(0);

      const fastSet = directSunHoursSampleSet(model, sunHoursQualityParams("fast", sideM));
      expect(sampleCounts(fastSet.samples)).toEqual({ roofs: fast.roofs, walls: fast.walls });
      expect(fastSet.roofCellM).toBe(3);
      expect(fastSet.wallCellM).toBe(fast.wallCellM);
    });
  }

  it("the High caps keep a full-cap run within about twice the Fast 1 km work", () => {
    const fastKmSampleSteps = 114_814 * 49;
    const highSteps = 146;
    const highWorstCase = (SUN_HOURS_HIGH_ROOF_SAMPLE_CAP + SUN_HOURS_HIGH_WALL_SAMPLE_CAP) * highSteps;
    expect(highWorstCase).toBeLessThanOrEqual(fastKmSampleSteps * 2);
  });
});

describe("Direct Sun Hours accuracy", () => {
  const openGround: [number, number] = [0.5, 40.5];
  const shadedGround: [number, number] = [0.5, -15.5];

  it("ground grid records the cell size and step it used", () => {
    const high = sunHoursQualityParams("high", 120);
    const grid = computeSunHoursGroundGrid(boxModel(), ...WINTER, high.cellM, high.stepMinutes)!;
    expect(grid.cellM).toBe(1);
    expect(grid.stepMinutes).toBe(5);
    expect(grid.cols).toBe(120);
    const fast = computeSunHoursGroundGrid(boxModel(), ...WINTER)!;
    expect(fast.cellM).toBe(3);
    expect(fast.stepMinutes).toBe(15);
  });

  it("High ground hours match a 1-minute brute-force reference within one High step", () => {
    for (const [east, north] of [openGround, shadedGround]) {
      const reference = bruteForceGroundHours(east, north);
      const high = groundHours(1, 5, east, north);
      expect(Math.abs(high - reference)).toBeLessThanOrEqual(0.1);
    }
    expect(bruteForceGroundHours(...shadedGround)).toBeLessThan(bruteForceGroundHours(...openGround) - 2);
  });

  it("Fast and High agree on open ground, with High closer to the reference", () => {
    const reference = bruteForceGroundHours(...openGround);
    const fast = groundHours(3, 15, ...openGround);
    const high = groundHours(1, 5, ...openGround);
    expect(reference).toBeGreaterThan(9);
    expect(Math.abs(fast - high)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(high - reference)).toBeLessThanOrEqual(Math.abs(fast - reference));
  });

  it("High roof and wall hours converge on a 1-minute run of the same samples", () => {
    const model = boxModel();
    const samples = directSunHoursSamplesForModel(model, sunHoursQualityParams("high", model.sideM));
    const roof = nearestSample(samples, "roof-cell", 0, 0);
    const northWall = nearestSample(samples, "facade-bay", 0, BOX.maxN, 12);
    const southWall = nearestSample(samples, "facade-bay", 0, BOX.minN, 12);
    const picked = [roof, northWall, southWall].map((index) => samples[index]!);
    expect(picked[1]!.outwardNorth).toBeGreaterThan(0.9);
    expect(picked[2]!.outwardNorth).toBeLessThan(-0.9);
    const high = directSunHoursAtSamples(model, picked, ...WINTER, 5)!;
    const reference = directSunHoursAtSamples(model, picked, ...WINTER, 1)!;
    for (let index = 0; index < picked.length; index++) {
      expect(Math.abs(high[index]! - reference[index]!)).toBeLessThanOrEqual(0.1);
    }
    expect(reference[0]!).toBeGreaterThan(8.5);
    expect(reference[1]!).toBeGreaterThan(8);
    expect(reference[2]!).toBeLessThan(0.5);
  });
});
