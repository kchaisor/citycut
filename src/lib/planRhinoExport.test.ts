import { describe, expect, it } from "vitest";
import { parseNativeAiLayers } from "./aiNative";
import { sitePlanAi8 } from "./aiPlan";
import { projectLocal } from "./crs";
import { model } from "./aiExport.test";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { localFromSheetPoint, sitePlanRhinoLayerNames, sitePlanTo3dm } from "./planRhinoExport";
import { layoutSheet } from "./figureGround";
import type { CityModel, Pt } from "../types";

const melbourne = { lon: 144.9631, lat: -37.8136 };
const sydney = { lon: 151.171, lat: -33.861 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

const melbourneModel: CityModel = {
  ...model(),
  center: melbourne,
  buildings: [{ id: 1, ring: square([0, 0], 40), holes: [], height: 12, use: "unclassified", source: "none" }],
};

type ReadCurve = {
  objectType: number;
  pointCount: number;
  point: (index: number) => number[];
};

function latin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function docLayerPaths(doc: InstanceType<Awaited<ReturnType<typeof loadRhino>>["File3dm"]>): string[] {
  const paths: string[] = [];
  for (let i = 0; i < doc.layers().count; i++) paths.push(doc.layers().get(i).fullPath);
  return paths;
}

function curvePointsOnLayer(
  rhino: Awaited<ReturnType<typeof loadRhino>>,
  doc: InstanceType<Awaited<ReturnType<typeof loadRhino>>["File3dm"]>,
  layerName: string,
): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < doc.objects().count; i++) {
    const object = doc.objects().get(i);
    const layer = doc.layers().get(object.attributes().layerIndex).fullPath;
    if (layer !== layerName) continue;
    const curve = object.geometry() as unknown as ReadCurve;
    if (curve.objectType !== rhino.ObjectType.Curve) continue;
    for (let p = 0; p < curve.pointCount; p++) out.push(curve.point(p));
  }
  return out;
}


describe("site plan .3dm", () => {
  it("writes EPSG:7855 for a Melbourne cut and EPSG:7856 for a Sydney cut", async () => {
    const melBytes = await sitePlanTo3dm(melbourneModel, 1000);
    expect(latin1(melBytes)).toContain("EPSG:7855");
    const sydBytes = await sitePlanTo3dm({ ...melbourneModel, center: sydney, placeLabel: "Sydney" }, 1000);
    expect(latin1(sydBytes)).toContain("EPSG:7856");
  });

  it("places a building corner at the expected MGA easting/northing with Z=0", async () => {
    const bytes = await sitePlanTo3dm(melbourneModel, 1000);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const expected = projectLocal([20, 20], melbourne, 55);
      const points = curvePointsOnLayer(rhino, doc, "Buildings");
      const hit = points.find(
        (point) =>
          Math.abs(point[0]! - expected[0]) < 0.01 &&
          Math.abs(point[1]! - expected[1]) < 0.01 &&
          Math.abs(point[2]!) < 0.01,
      );
      expect(hit).toBeTruthy();
    } finally {
      doc.destroy();
    }
  });

  it("uses the same layer names as the site plan .ai export", async () => {
    const aiLayers = parseNativeAiLayers(sitePlanAi8(melbourneModel, 1000)).filter(
      (name) => name !== "Frame/Sheet" && name !== "Frame" && name !== "Annotation",
    );
    const rhinoLayers = sitePlanRhinoLayerNames(melbourneModel, 1000);
    expect(rhinoLayers.sort()).toEqual(aiLayers.sort());
    const bytes = await sitePlanTo3dm(melbourneModel, 1000);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const paths = docLayerPaths(doc);
      for (const name of rhinoLayers) expect(paths).toContain(name);
    } finally {
      doc.destroy();
    }
  });

  it("matches 3D .3dm building footprint easting/northing at the same corner", async () => {
    const planBytes = await sitePlanTo3dm(melbourneModel, 1000);
    const solidBytes = await cityModelTo3dm(melbourneModel, { buildingsAsMesh: true });
    const rhino = await loadRhino();
    const planDoc = rhino.File3dm.fromByteArray(planBytes);
    const solidDoc = rhino.File3dm.fromByteArray(solidBytes);
    try {
      const corner = projectLocal([20, 20], melbourne, 55);
      const planPoints = curvePointsOnLayer(rhino, planDoc, "Buildings");
      const planHit = planPoints.find(
        (point) => Math.hypot(point[0]! - corner[0], point[1]! - corner[1]) < 0.01,
      );
      expect(planHit).toBeTruthy();

      type ReadMesh = {
        objectType: number;
        vertices: () => { count: number; point3dAt: (index: number) => number[] };
      };
      const meshPoints: number[][] = [];
      for (let i = 0; i < solidDoc.objects().count; i++) {
        const object = solidDoc.objects().get(i);
        if (object.attributes().name !== "Buildings::Unclassified") continue;
        const geometry = object.geometry() as unknown as ReadMesh;
        if (geometry.objectType !== rhino.ObjectType.Mesh) continue;
        for (let v = 0; v < geometry.vertices().count; v++) {
          meshPoints.push(geometry.vertices().point3dAt(v));
        }
      }
      const solidHit = meshPoints.find(
        (point) => Math.hypot(point[0]! - corner[0], point[1]! - corner[1]) < 0.01,
      );
      expect(solidHit).toBeTruthy();
      expect(planHit![0]).toBeCloseTo(solidHit![0], 2);
      expect(planHit![1]).toBeCloseTo(solidHit![1], 2);
    } finally {
      planDoc.destroy();
      solidDoc.destroy();
    }
  });

  it("round-trips sheet to local coordinates", () => {
    const layout = layoutSheet(200, 1000);
    const east = 12.5;
    const north = -8.2;
    const half = 100;
    const sheetX = layout.frameX + ((east + half) / 200) * layout.frameMm;
    const yDown = layout.frameY + ((half - north) / 200) * layout.frameMm;
    const sheetY = layout.pageHeightMm - yDown;
    const back = localFromSheetPoint(sheetX, sheetY, 200, layout);
    expect(back[0]).toBeCloseTo(east, 4);
    expect(back[1]).toBeCloseTo(north, 4);
  });
});
