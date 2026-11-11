import { describe, expect, it } from "vitest";
import { parseNativeAiLayers } from "./aiNative";
import { sitePlanAi8, sunStudyLayerName } from "./aiPlan";
import { planShadowRings } from "./buildingShadows";
import { projectLocal, mgaCrs } from "./crs";
import { model } from "./aiExport.test";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { planHeliodonForExport } from "./planHeliodonExport";
import { localFromSheetPoint, sitePlanRhinoLayerNames, sitePlanTo3dm } from "./planRhinoExport";
import { layoutSheet } from "./figureGround";
import { massingDrawingBuildings, massingUpperLevelPlanLines } from "./massingFootprint";
import { placedMga } from "./massingImport";
import { qaPodiumTowerMassing } from "./qaMassingFixture";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
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

function curveCountOnLayer(
  rhino: Awaited<ReturnType<typeof loadRhino>>,
  doc: InstanceType<Awaited<ReturnType<typeof loadRhino>>["File3dm"]>,
  layerName: string,
): number {
  let count = 0;
  for (let i = 0; i < doc.objects().count; i++) {
    const object = doc.objects().get(i);
    const layer = doc.layers().get(object.attributes().layerIndex).fullPath;
    if (layer !== layerName) continue;
    const curve = object.geometry() as unknown as ReadCurve;
    if (curve.objectType === rhino.ObjectType.Curve) count += 1;
  }
  return count;
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

  it("includes sun-study shadow and Sun path layers matching the .ai export", async () => {
    const date = { lat: melbourne.lat, lon: melbourne.lon, year: 2026, month: 9, day: 22 };
    const studyLayers = SUN_STUDY_HOURS.map((hour) => ({
      hour,
      rings: [...planShadowRings(melbourneModel, { ...date, hour, minute: 0 }, true)],
    }));
    const diagram = {
      ...date,
      hour: 12,
      minute: 0,
      sideM: melbourneModel.sideM,
      radiusFactor: 1,
    };
    const exportOpts = {
      sunStudy: { layers: studyLayers },
      heliodon: planHeliodonForExport({
        showPath: false,
        sunStudyActive: true,
        sunStudyDate: date,
        diagram,
      }),
      shadows: null,
      castShadows: true,
      sunStudyDate: date,
    };
    const aiLayers = parseNativeAiLayers(sitePlanAi8(melbourneModel, 1000, undefined, exportOpts)).filter(
      (name) => name !== "Frame/Sheet" && name !== "Frame" && name !== "Annotation",
    );
    const rhinoLayers = sitePlanRhinoLayerNames(melbourneModel, 1000, undefined, exportOpts);
    expect(rhinoLayers.sort()).toEqual(aiLayers.sort());
    expect(rhinoLayers).toContain("Sun path");
    expect(rhinoLayers).toContain(sunStudyLayerName(12));
    const bytes = await sitePlanTo3dm(melbourneModel, 1000, undefined, exportOpts);
    const buf = Buffer.from(bytes);
    const layerLabelInFile = (label: string) =>
      buf.includes(Buffer.from(label, "utf8")) || buf.includes(Buffer.from(label, "utf16le"));
    expect(layerLabelInFile("Sun path")).toBe(true);
    expect(layerLabelInFile(sunStudyLayerName(12))).toBe(true);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      expect(curveCountOnLayer(rhino, doc, "Sun path")).toBeGreaterThan(0);
      expect(curveCountOnLayer(rhino, doc, sunStudyLayerName(12))).toBeGreaterThan(0);
      const noon = curvePointsOnLayer(rhino, doc, sunStudyLayerName(12));
      expect(noon.some((point) => Math.abs(point[2]!) < 0.01)).toBe(true);
    } finally {
      doc.destroy();
    }
  });

  it("exports imported podium footprints and upper tower outlines at source MGA", async () => {
    const center = { lon: 145.1065, lat: -37.8045 };
    const zone = mgaCrs(center.lon).zone;
    const massing = qaPodiumTowerMassing(center, zone, 30);
    const podiumCorner = placedMga(massing, massing.placement, 0);
    const towerCorner = placedMga(massing, massing.placement, 8);
    const withMassing: CityModel = {
      ...melbourneModel,
      center,
      sideM: 650,
      buildings: [
        ...melbourneModel.buildings,
        ...massingDrawingBuildings([massing], center, zone),
      ],
      importedMassingUpperLevels: massingUpperLevelPlanLines([massing], center, zone),
    };
    const bytes = await sitePlanTo3dm(withMassing, 1000);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      expect(docLayerPaths(doc)).toContain("Imported massing");
      expect(docLayerPaths(doc)).toContain("Imported::Upper levels");
      expect(curveCountOnLayer(rhino, doc, "Imported massing")).toBeGreaterThan(0);
      expect(curveCountOnLayer(rhino, doc, "Imported::Upper levels")).toBeGreaterThan(0);
      const podiumPts = curvePointsOnLayer(rhino, doc, "Imported massing");
      const upperPts = curvePointsOnLayer(rhino, doc, "Imported::Upper levels");
      const near = (pts: number[][], e: number, n: number) =>
        pts.some(
          (point) =>
            Math.hypot(point[0]! - e, point[1]! - n) < 0.05 && Math.abs(point[2]!) < 0.01,
        );
      expect(near(podiumPts, podiumCorner[0], podiumCorner[1])).toBe(true);
      expect(near(upperPts, towerCorner[0], towerCorner[1])).toBe(true);
    } finally {
      doc.destroy();
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
