import { describe, expect, it, beforeEach } from "vitest";
import { parseNativeAiLayers } from "./aiNative";
import { sitePlanAi8, sitePlanPdf } from "./aiPlan";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { cityModelTo3dm } from "./rhinoExport";
import {
  buildingShadowPolygon,
  clearPlanShadowCache,
  planShadowOffset,
  planShadowRings,
  shadowRingsFromMulti,
} from "./buildingShadows";
import { openRing } from "./geo";
import { sunAtMelbourneLocal, sunDirectionFromAzimuthAltitude } from "./solar";
import type { BuildingFeat, CityModel } from "../types";

const CBD = { lat: -37.8136, lon: 144.9631 };

function boxBuilding(id: number, east: number, north: number, size: number, height: number): BuildingFeat {
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
    height,
    use: "unclassified",
    source: "none",
  };
}

function lBuilding(id: number, height: number): BuildingFeat {
  return {
    id,
    ring: [
      [0, 0],
      [20, 0],
      [20, 10],
      [10, 10],
      [10, 30],
      [0, 30],
      [0, 0],
    ],
    holes: [],
    height,
    use: "unclassified",
    source: "none",
  };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: CBD,
    sideM: 200,
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

describe("plan building shadows", () => {
  beforeEach(() => clearPlanShadowCache());

  it("casts a box shadow with length height / tan(altitude) toward the sun", () => {
    const sample = sunAtMelbourneLocal(CBD.lat, CBD.lon, 2026, 9, 22, 12, 0);
    const height = 10;
    const offset = planShadowOffset(sample, height)!;
    expect(offset).toBeTruthy();
    const length = Math.hypot(offset[0], offset[1]);
    const altitude = (sample.altitudeDeg * Math.PI) / 180;
    expect(length).toBeCloseTo(height / Math.tan(altitude), 2);
    const bearing = Math.atan2(offset[0], offset[1]);
    const sunBearing = Math.atan2(sample.direction[0], -sample.direction[2]);
    const shadowBearing = sunBearing + Math.PI;
    let delta = bearing - shadowBearing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    expect(Math.abs(delta)).toBeLessThan(0.02);
  });

  it("returns no shadows when the sun is below the horizon", () => {
    const rings = planShadowRings(
      model([boxBuilding(1, 0, 0, 20, 12)]),
      { ...CBD, year: 2026, month: 6, day: 21, hour: 2, minute: 0 },
      true,
    );
    expect(rings).toEqual([]);
  });

  it("unions a concave L footprint into one shadow patch", () => {
    const sample = sunAtMelbourneLocal(CBD.lat, CBD.lon, 2026, 6, 21, 12, 0);
    const offset = planShadowOffset(sample, 8)!;
    const multi = buildingShadowPolygon(lBuilding(1, 8), offset)!;
    const rings = shadowRingsFromMulti(multi);
    expect(rings.length).toBeGreaterThan(0);
    const area = rings[0]!.reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0);
    expect(area).toBeGreaterThan(400);
  });

  it("clips the union to the site frame", () => {
    const tall = boxBuilding(1, 90, 0, 10, 40);
    const rings = planShadowRings(
      model([tall]),
      { ...CBD, year: 2026, month: 6, day: 21, hour: 12, minute: 0 },
      true,
    );
    expect(rings.length).toBeGreaterThan(0);
    for (const polygon of rings) {
      for (const ring of polygon) {
        for (const [east, north] of ring) {
          expect(Math.abs(east)).toBeLessThanOrEqual(100.01);
          expect(Math.abs(north)).toBeLessThanOrEqual(100.01);
        }
      }
    }
  });

  it("casts winter midday shadows south and equinox 9am shadows west of a north building", () => {
    const north = boxBuilding(1, 0, 80, 20, 15);
    const winter = sunAtMelbourneLocal(CBD.lat, CBD.lon, 2026, 6, 21, 12, 0);
    const winterOffset = planShadowOffset(winter, north.height)!;
    expect(winterOffset[1]).toBeLessThan(-5);
    const equinox = sunAtMelbourneLocal(CBD.lat, CBD.lon, 2026, 9, 22, 9, 0);
    const equinoxOffset = planShadowOffset(equinox, north.height)!;
    expect(equinoxOffset[0]).toBeLessThan(-2);
  });

  it("exports a Shadows layer in site-plan PDF, AI8, and Rhino when castShadows is on", async () => {
    const shadowInput = { ...CBD, year: 2026, month: 6, day: 21, hour: 12, minute: 0 };
    const ai = sitePlanAi8(model([boxBuilding(1, 0, 0, 20, 12)]), 1000, undefined, {
      shadows: shadowInput,
      castShadows: true,
    });
    expect(parseNativeAiLayers(ai).map((name) => name.replace(/^CityCut /, ""))).toContain("Shadows");
    const pdf = await sitePlanPdf(model([boxBuilding(1, 0, 0, 20, 12)]), 1000, undefined, {
      shadows: shadowInput,
      castShadows: true,
    });
    const pdfDoc = await PDFDocument.load(pdf);
    const oc = pdfDoc.catalog.lookup(PDFName.of("OCProperties"), PDFDict);
    const config = oc.lookup(PDFName.of("D"), PDFDict);
    const order = config.lookup(PDFName.of("Order"), PDFArray);
    const pdfLayers: string[] = [];
    for (let i = 0; i < order.size(); i++) {
      const dict = pdfDoc.context.lookup(order.get(i), PDFDict);
      pdfLayers.push(dict.lookup(PDFName.of("Name"), PDFString).decodeText());
    }
    expect(pdfLayers.some((name) => name.startsWith("Shadows"))).toBe(true);
    const bytes = await cityModelTo3dm(model([boxBuilding(1, 0, 0, 20, 12)]), {
      shadows: shadowInput,
      castShadows: true,
    });
    const rhinoModule = await import("rhino3dm/rhino3dm.module.js");
    const rhino = await rhinoModule.default();
    const rhinoDoc = rhino.File3dm.fromByteArray(bytes);
    let hasShadowLayer = false;
    for (let i = 0; i < rhinoDoc.layers().count; i++) {
      if (rhinoDoc.layers().get(i).fullPath === "Shadows") hasShadowLayer = true;
    }
    rhinoDoc.destroy();
    expect(hasShadowLayer).toBe(true);
  });

  it("uses a known sun vector for shadow direction", () => {
    const sample = {
      altitudeDeg: 45,
      azimuthDeg: 0,
      direction: sunDirectionFromAzimuthAltitude(0, 45),
      aboveHorizon: true,
      date: new Date(),
    };
    const offset = planShadowOffset(sample, 10)!;
    expect(offset[0]).toBeCloseTo(0, 6);
    expect(offset[1]).toBeCloseTo(-10, 6);
  });
});

function ringArea(ring: ReturnType<typeof openRing>): number {
  const points = openRing(ring);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
