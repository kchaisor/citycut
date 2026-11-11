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

function meshGableHouse(
  r: Rhino,
  doc: RhinoDoc,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  zEave: number,
  zPeak: number,
) {
  const mesh = new r.Mesh();
  const mx0 = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const verts = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, zEave],
    [x1, y0, zEave],
    [x1, y1, zEave],
    [x0, y1, zEave],
    [mx0, my, zPeak],
    [x1, my, zPeak],
  ];
  for (const [x, y, z] of verts) mesh.vertices().add(x, y, z);
  mesh.faces().addTriFace(0, 2, 1);
  mesh.faces().addTriFace(0, 3, 2);
  const walls = [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  for (const [a, b, c, d] of walls) {
    mesh.faces().addTriFace(a, b, c);
    mesh.faces().addTriFace(a, c, d);
  }
  mesh.faces().addTriFace(4, 5, 9);
  mesh.faces().addTriFace(4, 9, 8);
  mesh.faces().addTriFace(6, 7, 8);
  mesh.faces().addTriFace(6, 8, 9);
  mesh.faces().addTriFace(4, 7, 8);
  mesh.faces().addTriFace(5, 6, 9);
  doc.objects().addMesh(mesh, new r.ObjectAttributes());
}

export type MassingFixtureKind =
  | "separate"
  | "setback"
  | "millimetres"
  | "edgeTower"
  | "rozelleCampus"
  | "rozelleCampusMm"
  | "gableSingle";

const PODIUM_Z = 20;

type CampusTower = { x0: number; y0: number; x1: number; y1: number; height: number };
type CampusPodium = { x0: number; y0: number; x1: number; y1: number; towers: CampusTower[] };

const ROZELLE_CAMPUS: CampusPodium[] = [
  {
    x0: -85,
    y0: -40,
    x1: -25,
    y1: 30,
    towers: [
      { x0: -68, y0: -18, x1: -52, y1: -2, height: 95 },
      { x0: -58, y0: 8, x1: -42, y1: 22, height: 140 },
    ],
  },
  {
    x0: -20,
    y0: -35,
    x1: 40,
    y1: 35,
    towers: [{ x0: 2, y0: -8, x1: 18, y1: 10, height: 120 }],
  },
  {
    x0: 50,
    y0: -45,
    x1: 115,
    y1: 25,
    towers: [
      { x0: 62, y0: -28, x1: 78, y1: -12, height: 85 },
      { x0: 82, y0: 2, x1: 98, y1: 18, height: 110 },
    ],
  },
];

function addRozelleCampusMeshes(
  r: Rhino,
  doc: RhinoDoc,
  baseE: number,
  baseN: number,
  scale: number,
): void {
  const ox = (x: number) => baseE + x * scale;
  const oy = (y: number) => baseN + y * scale;
  const oz = (z: number) => z * scale;
  for (const podium of ROZELLE_CAMPUS) {
    meshBox(r, doc, ox(podium.x0), oy(podium.y0), ox(podium.x1), oy(podium.y1), oz(0), oz(PODIUM_Z));
    for (const tower of podium.towers) {
      meshBox(
        r,
        doc,
        ox(tower.x0),
        oy(tower.y0),
        ox(tower.x1),
        oy(tower.y1),
        oz(PODIUM_Z),
        oz(PODIUM_Z + tower.height),
      );
    }
  }
}

export async function buildMassingFixtureBytes(
  kind: MassingFixtureKind,
  center: CityModel["center"],
  zone: number,
): Promise<Uint8Array> {
  const r = await loadRhino();
  const doc = new r.File3dm();
  const [baseE, baseN] = projectLocal([0, 0], center, zone);
  const scale = kind === "millimetres" || kind === "rozelleCampusMm" ? 1000 : 1;
  const ox = (dx: number) => baseE + dx * scale;
  const oy = (dy: number) => baseN + dy * scale;
  const oz = (dz: number) => dz * scale;
  if (kind === "millimetres" || kind === "rozelleCampusMm") doc.settings().modelUnitSystem = r.UnitSystem.Millimeters;
  else doc.settings().modelUnitSystem = r.UnitSystem.Meters;

  if (kind === "rozelleCampus" || kind === "rozelleCampusMm") {
    addRozelleCampusMeshes(r, doc, baseE, baseN, scale);
    return doc.toByteArray();
  }
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
  if (kind === "gableSingle") {
    meshGableHouse(r, doc, ox(0), oy(0), ox(30), oy(20), oz(0), oz(12), oz(22));
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
