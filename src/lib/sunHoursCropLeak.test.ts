import { describe, expect, it } from "vitest";
import { cutSpecFromA3 } from "./cutSpec";
import { modelFrameBounds } from "./modelFrame";
import { containsPoint, makeSiteFrame, type SiteFrame, type SiteFrameShape } from "./siteFrame";
import { directSunHoursSamplesForModel } from "./sunHoursDirectSample";
import { buildSunHoursGroundDrapeGeometry } from "./sunHoursGroundDrape";
import { computeSunHoursGroundGrid, sampleSunHoursGroundCell, type SunHoursGroundGrid } from "./sunHoursGroundPlan";
import { sunHoursGroundImageFor3d } from "./sunHoursGroundRaster";
import { SUN_HOURS_HIGH_CELL_M, sunHoursQualityParams } from "./sunHoursQuality";
import { buildRoofFootprintMeshesForModel } from "./sunHoursRoofFootprint";
import { sunStudyModelKey } from "./sunStudyPlan";
import type { BuildingFeat, CityModel, Pt } from "../types";

const rozelle = { lat: -33.867118, lon: 151.18178 };
const WINTER = [2026, 6, 21] as const;
const CELL_M = 20;

function block(id: number, east: number, north: number, size = 30, extra: Partial<BuildingFeat> = {}): BuildingFeat {
  const half = size / 2;
  return {
    id,
    ring: [
      [east - half, north - half],
      [east + half, north - half],
      [east + half, north + half],
      [east - half, north + half],
      [east - half, north - half],
    ],
    holes: [],
    height: 18,
    use: "commercial",
    source: "none",
    ...extra,
  };
}

function site(
  sideM: number,
  frameShape: SiteFrameShape,
  size: { widthM: number; heightM: number } | null,
  buildings: BuildingFeat[],
): CityModel {
  return {
    placeLabel: "Test",
    center: rozelle,
    sideM,
    ...(size ?? {}),
    frameShape,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function a3Site(orientation: "landscape" | "portrait", buildings: BuildingFeat[]) {
  const spec = cutSpecFromA3(3500, orientation);
  const sideM = Math.max(spec.widthM, spec.heightM);
  const size = { widthM: spec.widthM, heightM: spec.heightM };
  return { spec, sideM, frame: makeSiteFrame(sideM, "a3", size), model: site(sideM, "a3", size, buildings) };
}

function unmaskedCentres(grid: SunHoursGroundGrid): Pt[] {
  const out: Pt[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.masked[row * grid.cols + col]) continue;
      out.push([grid.originEast + (col + 0.5) * grid.cellM, grid.originNorth + (row + 0.5) * grid.cellM]);
    }
  }
  return out;
}

function colouredCentres(grid: SunHoursGroundGrid): Pt[] {
  const image = sunHoursGroundImageFor3d(grid, Math.max(grid.maxSunHours, 1))!;
  const out: Pt[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const alpha = image.data[((grid.rows - 1 - row) * grid.cols + col) * 4 + 3]!;
      if (alpha > 0) out.push([grid.originEast + (col + 0.5) * grid.cellM, grid.originNorth + (row + 0.5) * grid.cellM]);
    }
  }
  return out;
}

function drapeTriangleCentres(grid: SunHoursGroundGrid, model: CityModel): Pt[] {
  const geometry = buildSunHoursGroundDrapeGeometry(grid, model);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex()!;
  const out: Pt[] = [];
  for (let face = 0; face < index.count; face += 3) {
    let east = 0;
    let north = 0;
    for (let corner = 0; corner < 3; corner++) {
      east += position.getX(index.getX(face + corner)) / 3;
      north += -position.getZ(index.getX(face + corner)) / 3;
    }
    out.push([east, north]);
  }
  return out;
}

function expectInside(frame: SiteFrame, points: Pt[], margin = 0) {
  expect(points.length).toBeGreaterThan(0);
  expect(points.filter((point) => !containsPoint(frame, point, margin))).toEqual([]);
}

describe("sun hours stay inside the cropped site shape", () => {
  for (const orientation of ["landscape", "portrait"] as const) {
    describe(`A3 1:3500 ${orientation}`, () => {
      const inside = block(1, 0, 0);
      const { spec, sideM, frame, model } = a3Site(orientation, [inside]);
      const grid = computeSunHoursGroundGrid(model, ...WINTER, CELL_M)!;
      const halfW = spec.widthM / 2;
      const halfH = spec.heightM / 2;
      const shortHalf = Math.min(halfW, halfH);
      const beyondSheet = (sideM / 2 + shortHalf) / 2;
      const outsideSheet: Pt = orientation === "landscape" ? [0, beyondSheet] : [beyondSheet, 0];

      it("sizes the ground grid from the A3 sheet, not the enclosing square", () => {
        expect(grid.originEast).toBeCloseTo(-halfW, 6);
        expect(grid.originNorth).toBeCloseTo(-halfH, 6);
        expect(grid.cols * grid.cellM).toBeLessThan(spec.widthM + grid.cellM);
        expect(grid.rows * grid.cellM).toBeLessThan(spec.heightM + grid.cellM);
        expect(grid.cols * grid.cellM).toBeGreaterThanOrEqual(spec.widthM);
        expect(grid.rows * grid.cellM).toBeGreaterThanOrEqual(spec.heightM);
        expect(modelFrameBounds(model)).toEqual({ minE: -halfW, maxE: halfW, minN: -halfH, maxN: halfH });
      });

      it("keeps every unmasked and every coloured ground cell inside the sheet", () => {
        expectInside(frame, unmaskedCentres(grid));
        expectInside(frame, colouredCentres(grid));
        expect(grid.maxSunHours).toBeGreaterThan(0);
      });

      it("does not colour a point inside the enclosing square but off the sheet", () => {
        expect(containsPoint(frame, outsideSheet)).toBe(false);
        expect(Math.abs(outsideSheet[0])).toBeLessThan(sideM / 2);
        expect(Math.abs(outsideSheet[1])).toBeLessThan(sideM / 2);
        expect(sampleSunHoursGroundCell(grid, outsideSheet[0], outsideSheet[1]).masked).toBe(true);
        expect(sampleSunHoursGroundCell(grid, 100, 100).masked).toBe(false);
      });

      it("drapes the 3D ground mesh over the sheet only", () => {
        expectInside(frame, drapeTriangleCentres(grid, model), grid.cellM);
      });

      it("samples roofs and walls only on buildings inside the sheet", () => {
        const offSheet = block(2, outsideSheet[0], outsideSheet[1]);
        const straddling = block(3, orientation === "landscape" ? 200 : halfW, orientation === "landscape" ? halfH : 200);
        const withImports = { ...model, buildings: [inside, offSheet, straddling] };
        const samples = directSunHoursSamplesForModel(withImports);
        expectInside(frame, samples.map((sample) => [sample.east, sample.north] as Pt), 0.2);
        const sampled = new Set(samples.map((sample) => sample.buildingId));
        expect(sampled.has(1)).toBe(true);
        expect(sampled.has(2)).toBe(false);
        expect(sampled.has(3)).toBe(true);
        expect(samples.filter((sample) => sample.buildingId === 1).length).toBe(
          directSunHoursSamplesForModel(model).length,
        );
        const { buildingTriangles } = buildRoofFootprintMeshesForModel(
          withImports,
          samples,
          new Float32Array(samples.length),
          1,
        );
        expect(buildingTriangles.get(1)).toBeGreaterThan(0);
        expect(buildingTriangles.has(2)).toBe(false);
      });
    });
  }

  it("keys the sun-hours job by sheet orientation", () => {
    expect(sunStudyModelKey(a3Site("landscape", []).model)).not.toBe(sunStudyModelKey(a3Site("portrait", []).model));
  });

  it("High picks its ground cell from the cropped sheet, not the enclosing square", () => {
    const sheet = { widthM: 140, heightM: 99 };
    expect(sunHoursQualityParams("high", 140).cellM).toBe(0.5);
    expect(sunHoursQualityParams("high", 140, sheet).cellM).toBe(SUN_HOURS_HIGH_CELL_M);
    expect(sunHoursQualityParams("high", 140, { widthM: 140, heightM: 140 })).toEqual(sunHoursQualityParams("high", 140));
  });

  describe("circle", () => {
    const sideM = 600;
    const frame = makeSiteFrame(sideM, "circle");
    const model = site(sideM, "circle", null, [block(1, 0, 0)]);
    const grid = computeSunHoursGroundGrid(model, ...WINTER, CELL_M)!;
    const corner = sideM / 2 - CELL_M / 2;

    it("keeps ground cells inside the circle and drops the square's corners", () => {
      expect(grid.originEast).toBe(-sideM / 2);
      expect(grid.cols).toBe(sideM / CELL_M);
      expect(grid.rows).toBe(sideM / CELL_M);
      expectInside(frame, unmaskedCentres(grid));
      expectInside(frame, colouredCentres(grid));
      for (const [east, north] of [
        [corner, corner],
        [-corner, corner],
        [corner, -corner],
        [-corner, -corner],
      ]) {
        expect(sampleSunHoursGroundCell(grid, east!, north!)).toEqual({ hours: -1, masked: true });
      }
      expect(sampleSunHoursGroundCell(grid, corner, 0).masked).toBe(false);
    });

    it("leaves no 3D ground mesh in the corners", () => {
      const centres = drapeTriangleCentres(grid, model);
      expectInside(frame, centres, grid.cellM);
      expect(centres.length).toBeLessThan(grid.cols * grid.rows * 2);
    });

    it("skips roofs and walls of a building in a corner", () => {
      const samples = directSunHoursSamplesForModel({ ...model, buildings: [block(1, 0, 0), block(2, corner - 20, corner - 20)] });
      expect(new Set(samples.map((sample) => sample.buildingId))).toEqual(new Set([1]));
    });
  });

  describe("square", () => {
    const sideM = 600;
    const model = site(sideM, "square", null, []);
    const grid = computeSunHoursGroundGrid(model, ...WINTER, CELL_M)!;

    it("still covers the full square", () => {
      expect(grid.originEast).toBe(-sideM / 2);
      expect(grid.originNorth).toBe(-sideM / 2);
      expect(grid.cols).toBe(sideM / CELL_M);
      expect(grid.rows).toBe(sideM / CELL_M);
      expect(unmaskedCentres(grid).length).toBe(grid.cols * grid.rows);
      expect(colouredCentres(grid).length).toBe(grid.cols * grid.rows);
      expect(drapeTriangleCentres(grid, model).length).toBe(grid.cols * grid.rows * 2);
      const edge = sideM / 2 - CELL_M / 2;
      expect(sampleSunHoursGroundCell(grid, edge, edge).masked).toBe(false);
      expect(sampleSunHoursGroundCell(grid, -edge, -edge).masked).toBe(false);
    });

    it("keeps roof and wall samples on a building at the square's edge", () => {
      const edgeBlock = block(1, sideM / 2 - 15, 0);
      const samples = directSunHoursSamplesForModel({ ...model, buildings: [edgeBlock] });
      expect(samples.some((sample) => sample.kind === "roof-cell")).toBe(true);
      expect(samples.some((sample) => sample.kind === "facade-bay" && sample.east > sideM / 2)).toBe(true);
    });
  });
});
