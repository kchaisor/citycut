import { describe, expect, it } from "vitest";
import { mgaToLocal, projectLocal } from "./crs";
import { mgaCrs } from "./crsZone";
import { cityModelTo3dm, IMPORTED_MASSING_LAYER, loadRhino } from "./rhinoExport";
import {
  canAddMassing,
  fractionOutsideCut,
  looksLocal,
  massingWarnings,
  MassingImportError,
  mgaPlacement,
  parseMassing3dm,
  placedLocal,
  placedMga,
  type ImportedMassing,
} from "./massingImport";
import type { CityModel, Pt } from "../types";

const origin = { lon: 144.98038, lat: -37.81356 }; // East Melbourne
const zone = mgaCrs(origin.lon).zone;

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

const model: CityModel = {
  placeLabel: "East Melbourne",
  center: origin,
  sideM: 1000,
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
  buildings: [{ id: 1, ring: square([0, 0], 40), holes: [], height: 73.1, use: "residential", source: "none" }],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "test",
};

type Rhino = Awaited<ReturnType<typeof loadRhino>>;

/** Closed box mesh in the doc, corners in absolute coordinates. */
function addBox(rhino: Rhino, doc: InstanceType<Rhino["File3dm"]>, min: number[], max: number[]) {
  const mesh = new rhino.Mesh();
  const v = mesh.vertices();
  v.useDoublePrecisionVertices = true;
  const [x0, y0, z0] = min as [number, number, number];
  const [x1, y1, z1] = max as [number, number, number];
  for (const [x, y, z] of [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ] as const) (v as unknown as { addPoint3d(x: number, y: number, z: number): number }).addPoint3d(x, y, z);
  const f = mesh.faces();
  f.addQuadFace(0, 3, 2, 1);
  f.addQuadFace(4, 5, 6, 7);
  f.addQuadFace(0, 1, 5, 4);
  f.addQuadFace(1, 2, 6, 5);
  f.addQuadFace(2, 3, 7, 6);
  f.addQuadFace(3, 0, 4, 7);
  doc.objects().addMesh(mesh, new rhino.ObjectAttributes());
}

function asImported(parsed: ReturnType<typeof parseMassing3dm>, bytes: number): ImportedMassing {
  return { ...parsed, id: "t", name: "box", fileBytes: bytes, mode: "mga", placement: mgaPlacement(parsed), visible: true };
}

describe(".3dm massing import", () => {
  it("round-trips: a box drawn at known MGA on a CityCut export lands within 0.05 m", async () => {
    const rhino = await loadRhino();
    const exported = await cityModelTo3dm(model, { hideTrees: true });
    const doc = rhino.File3dm.fromByteArray(exported);
    // Known local target: 120 m east, 80 m north of the cut centre, 20 × 30 × 45 m, base at Z = 12.5.
    const [e0, n0] = projectLocal([110, 65], origin, zone);
    const [e1, n1] = projectLocal([130, 95], origin, zone);
    addBox(rhino, doc, [e0, n0, 12.5], [e1, n1, 57.5]);
    const bytes = doc.toByteArray();
    doc.destroy();

    const parsed = parseMassing3dm(rhino, bytes);
    expect(parsed.sourceUnits).toBe("Meters");
    expect(parsed.fileZone).toBe(55);
    expect(looksLocal(parsed)).toBe(false);
    // Our own export carries buildings too; check the box corners specifically.
    const local = placedLocal(parsed, mgaPlacement(parsed), origin, zone);
    const want = [
      [110, 65, 12.5], [130, 95, 57.5],
    ];
    for (const [x, y, z] of want) {
      let best = Infinity;
      for (let i = 0; i < local.length; i += 3) {
        best = Math.min(best, Math.hypot(local[i]! - x!, local[i + 1]! - y!, local[i + 2]! - z!));
      }
      expect(best).toBeLessThan(0.05);
    }
    // And MGA in = MGA out.
    for (let i = 0; i < parsed.positions.length / 3; i++) {
      const [e, n] = placedMga(parsed, mgaPlacement(parsed), i);
      const back = projectLocal(mgaToLocal(e, n, origin, zone), origin, zone);
      expect(Math.hypot(back[0] - e, back[1] - n)).toBeLessThan(0.001);
    }
  });

  it("writes imports to their own .3dm layer at the same MGA coordinates", async () => {
    const rhino = await loadRhino();
    const doc = new rhino.File3dm();
    doc.settings().modelUnitSystem = rhino.UnitSystem.Meters;
    const [e0, n0] = projectLocal([-50, -50], origin, zone);
    addBox(rhino, doc, [e0, n0, 10], [e0 + 15, n0 + 15, 40]);
    const parsed = parseMassing3dm(rhino, doc.toByteArray());
    doc.destroy();
    const out = rhino.File3dm.fromByteArray(
      await cityModelTo3dm(model, { importedMassing: [asImported(parsed, 1)] }),
    );
    try {
      let found = 0;
      for (let i = 0; i < out.objects().count; i++) {
        const object = out.objects().get(i);
        if (out.layers().get(object.attributes().layerIndex).fullPath !== IMPORTED_MASSING_LAYER) continue;
        found++;
        const vertices = (object.geometry() as unknown as { vertices(): { count: number; point3dAt(i: number): number[] } }).vertices();
        let minE = Infinity, minN = Infinity, minZ = Infinity;
        for (let v = 0; v < vertices.count; v++) {
          const [x, y, z] = vertices.point3dAt(v);
          minE = Math.min(minE, x!); minN = Math.min(minN, y!); minZ = Math.min(minZ, z!);
        }
        expect(Math.abs(minE - e0)).toBeLessThan(0.05);
        expect(Math.abs(minN - n0)).toBeLessThan(0.05);
        expect(Math.abs(minZ - 10)).toBeLessThan(0.05);
      }
      expect(found).toBe(1);
    } finally {
      out.destroy();
    }
  });

  it("scales millimetres, flags local coordinates, outside-cut and wrong zone", async () => {
    const rhino = await loadRhino();
    const doc = new rhino.File3dm();
    doc.settings().modelUnitSystem = rhino.UnitSystem.Millimeters;
    addBox(rhino, doc, [0, 0, 0], [10000, 20000, 30000]);
    const parsed = parseMassing3dm(rhino, doc.toByteArray());
    doc.destroy();
    expect(parsed.unitScale).toBe(0.001);
    expect(parsed.halfExtent.x).toBeCloseTo(5, 6);
    expect(looksLocal(parsed)).toBe(true);
    expect(parsed.fileZone).toBeNull(); // unset earth anchor is not a zone
    const imported = { ...asImported(parsed, 1), fileZone: 54 };
    const local = placedLocal(imported, imported.placement, origin, zone);
    const warnings = massingWarnings(imported, local, model, zone).join(" ");
    expect(warnings).toMatch(/millimeters/);
    expect(warnings).toMatch(/look local/);
    expect(warnings).toMatch(/zone 54/);
    expect(warnings).toMatch(/entirely outside/);
    expect(fractionOutsideCut(new Float64Array([0, 0, 0, 600, 0, 0]), 1000)).toBe(0.5);
  });

  it("rotates about the vertical axis through the base centre only", () => {
    const massing = { positions: new Float32Array([10, 0, 5]) };
    const [e, n, z] = placedMga(massing, { e: 1000, n: 2000, base: 3, rotDeg: 90 }, 0);
    expect(e).toBeCloseTo(1000, 6);
    expect(n).toBeCloseTo(2010, 6);
    expect(z).toBe(8);
  });

  it("rejects surfaces without a render mesh, and enforces limits", async () => {
    const rhino = await loadRhino();
    const doc = new rhino.File3dm();
    const sphere = new rhino.Sphere([0, 0, 0], 5);
    doc.objects().add(sphere.toBrep(), new rhino.ObjectAttributes());
    const bytes = doc.toByteArray();
    doc.destroy();
    expect(() => parseMassing3dm(rhino, bytes)).toThrow(/_Mesh/);
    expect(() => parseMassing3dm(rhino, new Uint8Array(50 * 1024 * 1024 + 1))).toThrow(MassingImportError);
    expect(canAddMassing(Array.from({ length: 20 }, () => ({ triangles: 1 })), 1)).toMatch(/20/);
    expect(canAddMassing([{ triangles: 499_999 }], 2)).toMatch(/500,000/);
    expect(canAddMassing([], 12)).toBeNull();
  });
});
