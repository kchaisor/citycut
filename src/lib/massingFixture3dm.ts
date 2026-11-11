import type { CityModel, Pt } from "../types";
import { projectLocal } from "./crs";
import { loadRhino } from "./rhinoExport";
import { parseMassing3dm, mgaPlacement, type ImportedMassing } from "./massingImport";
import { massingUpperLevelOutlines } from "./massingFootprint";

type Rhino = Awaited<ReturnType<typeof loadRhino>>;
type RhinoDoc = InstanceType<Rhino["File3dm"]>;

function meshBox(
  r: Rhino,
  doc: RhinoDoc,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  invertRoof = false,
) {
  const mesh = new r.Mesh();
  for (const z of [z0, z1])
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as const)
      mesh.vertices().add(x, y, z);
  const sides = [
    [0, 3, 2, 1],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  for (const [a, b, c, d] of sides) {
    mesh.faces().addTriFace(a, b, c);
    mesh.faces().addTriFace(a, c, d);
  }
  if (invertRoof) {
    mesh.faces().addTriFace(4, 6, 5);
    mesh.faces().addTriFace(4, 7, 6);
  } else {
    mesh.faces().addTriFace(4, 5, 6);
    mesh.faces().addTriFace(4, 6, 7);
  }
  mesh.faces().addTriFace(0, 3, 2);
  mesh.faces().addTriFace(0, 2, 1);
  doc.objects().addMesh(mesh, new r.ObjectAttributes());
}

export type MassingFixtureKind = "separate" | "setback" | "millimetres" | "edgeTower";

export async function buildMassingFixtureBytes(
  kind: MassingFixtureKind,
  center: CityModel["center"],
  zone: number,
): Promise<Uint8Array> {
  const r = await loadRhino();
  const doc = new r.File3dm();
  const [baseE, baseN] = projectLocal([0, 0], center, zone);
  const scale = kind === "millimetres" ? 1000 : 1;
  const ox = (dx: number) => baseE + dx * scale;
  const oy = (dy: number) => baseN + dy * scale;
  const oz = (dz: number) => dz * scale;
  if (kind === "millimetres") doc.settings().modelUnitSystem = r.UnitSystem.Millimeters;
  else doc.settings().modelUnitSystem = r.UnitSystem.Meters;

  if (kind === "separate") {
    meshBox(r, doc, ox(0), oy(0), ox(30), oy(20), oz(0), oz(12));
    meshBox(r, doc, ox(5), oy(5), ox(15), oy(15), oz(12), oz(38));
    return doc.toByteArray();
  }
  if (kind === "setback") {
    meshBox(r, doc, ox(0), oy(0), ox(30), oy(20), oz(0), oz(12));
    meshBox(r, doc, ox(6), oy(4), ox(14), oy(12), oz(12), oz(36));
    meshBox(r, doc, ox(-4), oy(-6), ox(10), oy(0), oz(12), oz(30));
    return doc.toByteArray();
  }
  if (kind === "millimetres") {
    meshBox(r, doc, ox(0), oy(0), ox(30), oy(20), oz(0), oz(12));
    meshBox(r, doc, ox(8), oy(8), ox(18), oy(18), oz(12), oz(42));
    return doc.toByteArray();
  }
  meshBox(r, doc, ox(0), oy(0), ox(30), oy(20), oz(0), oz(12));
  meshBox(r, doc, ox(22), oy(6), ox(30), oy(16), oz(12), oz(40), true);
  return doc.toByteArray();
}

export async function importMassingFixture(
  kind: MassingFixtureKind,
  center: CityModel["center"],
  zone: number,
): Promise<ImportedMassing> {
  const r = await loadRhino();
  const bytes = await buildMassingFixtureBytes(kind, center, zone);
  const parsed = parseMassing3dm(r, bytes);
  return {
    ...parsed,
    id: `fixture-${kind}`,
    name: `${kind}.3dm`,
    fileBytes: bytes.byteLength,
    mode: "mga",
    visible: true,
    placement: mgaPlacement(parsed),
  };
}

export function towerOutlineCount(item: ImportedMassing, origin: CityModel["center"], zone: number): number {
  const upper = massingUpperLevelOutlines(item, origin, zone);
  return upper.reduce((sum, level) => sum + level.lines.length, 0);
}

export function ringArea(ring: Pt[]): number {
  let s = 0;
  for (let i = 0; i + 1 < ring.length; i++) s += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return Math.abs(s / 2);
}
