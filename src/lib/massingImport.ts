import type rhino3dm from "rhino3dm/rhino3dm.module.js";
import { mgaToLocal, projectLocal } from "./crs";
import { mgaZone } from "./crsZone";
import type { CityModel, LonLat } from "../types";

type Rhino = Awaited<ReturnType<typeof rhino3dm>>;
type RhinoDoc = InstanceType<Rhino["File3dm"]>;

/** Browser memory: the file, rhino3dm's wasm-heap copy (2–3× file) and three buffers coexist. */
export const MASSING_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MASSING_WARN_FILE_BYTES = 25 * 1024 * 1024;
export const MASSING_MAX_TRIANGLES = 500_000;
export const MASSING_MAX_MODELS = 20;

/** Smaller than any MGA easting/northing in Australia, so smaller coordinates are a local frame. */
const MGA_MIN_EASTING = 100_000;
const MGA_MIN_NORTHING = 1_000_000;

export type MassingPlacementMode = "mga" | "click";

/** Where the base centre of the model sits, in MGA metres, and its turn about Z (degrees, CCW). */
export type MassingPlacement = { e: number; n: number; base: number; rotDeg: number };

export type ParsedMassing = {
  /** Vertices relative to {@link anchor}, metres, Z-up: x east, y north, z up. */
  positions: Float32Array;
  indices: Uint32Array;
  triangles: number;
  /** Base centre of the bounding box in the file's coordinates (metres after unit scaling). */
  anchor: { e: number; n: number; z: number };
  /** Bounding box half extents (metres). */
  halfExtent: { x: number; y: number };
  sourceUnits: string;
  unitScale: number;
  /** MGA zone named by the file (earth anchor or CRS string), when it names one. */
  fileZone: number | null;
  /** Surfaces left out because they have no render mesh. */
  rejectedSurfaces: number;
  /** Notes that stay with the model (units, rejected surfaces, local frame, zone). */
  notes: string[];
};

export type ImportedMassing = {
  id: string;
  name: string;
  fileBytes: number;
  mode: MassingPlacementMode;
  placement: MassingPlacement;
  visible: boolean;
} & ParsedMassing;

export class MassingImportError extends Error {}

const UNIT_METRES: Record<string, number> = {
  Millimeters: 0.001,
  Centimeters: 0.01,
  Decimeters: 0.1,
  Meters: 1,
  Kilometers: 1000,
  Inches: 0.0254,
  Feet: 0.3048,
};

function unitInfo(rhino: Rhino, doc: RhinoDoc): { name: string; scale: number } {
  const value = doc.settings().modelUnitSystem as unknown;
  const enumObject = rhino.UnitSystem as unknown as Record<string, unknown>;
  let name = "Meters";
  for (const [key, entry] of Object.entries(enumObject)) {
    if (entry === value || (entry as { value?: unknown })?.value === (value as { value?: unknown })?.value) {
      name = key;
      break;
    }
  }
  if (name === "None") return { name: "unset", scale: 1 };
  const scale = UNIT_METRES[name];
  if (scale == null) throw new MassingImportError(`File units are ${name}. Save it in metres or millimetres.`);
  return { name, scale };
}

function sameEnum(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const av = (a as { value?: unknown })?.value;
  return av != null && av === (b as { value?: unknown })?.value;
}

function fileZoneOf(doc: RhinoDoc): number | null {
  // rhino3dm's typings say getvalue(index); the binding takes the key.
  const getvalue = doc.strings().getvalue as unknown as (key: string) => string | undefined;
  let crs = "";
  try {
    crs = getvalue.call(doc.strings(), "CRS") ?? "";
  } catch {
    crs = "";
  }
  const epsg = /EPSG:78(\d\d)/.exec(crs);
  if (epsg) return Number(epsg[1]);
  const anchor = doc.settings().earthAnchorPoint;
  const lon = anchor?.earthBasepointLongitude;
  const lat = anchor?.earthBasepointLatitude;
  // An unset anchor reads as 0/0 or ±180; only an anchor inside the MGA zones (90–174°E) names a zone.
  if (Number.isFinite(lon) && Number.isFinite(lat) && lon > 90 && lon < 174 && lat < 0) return mgaZone(lon);
  return null;
}

type MeshLike = {
  vertices(): { count: number; point3dAt(index: number): number[] };
  faces(): { count: number; get(index: number): number[] };
};

/**
 * Read a Rhino .3dm into one triangle soup. Meshes are used as is; Extrusions and Breps use their
 * cached render meshes. A surface without a render mesh is rejected (rhino3dm cannot mesh NURBS),
 * with a note to run _Mesh in Rhino. Coordinates are scaled to metres and kept in the file's frame.
 */
export function parseMassing3dm(rhino: Rhino, bytes: Uint8Array): ParsedMassing {
  if (bytes.byteLength > MASSING_MAX_FILE_BYTES) {
    throw new MassingImportError("This file is over 50 MB. Reduce the model or mesh it more coarsely in Rhino.");
  }
  const doc = rhino.File3dm.fromByteArray(bytes);
  if (!doc) throw new MassingImportError("This is not a Rhino .3dm file rhino3dm can read.");
  try {
    const units = unitInfo(rhino, doc);
    const fileZone = fileZoneOf(doc);
    const meshes: MeshLike[] = [];
    let rejectedSurfaces = 0;
    let blocks = 0;
    const objects = doc.objects();
    for (let i = 0; i < objects.count; i++) {
      const geometry = objects.get(i).geometry() as unknown as {
        objectType: unknown;
        getMesh?: (type: unknown) => MeshLike | null;
        faces?: () => { count: number; get(index: number): { getMesh(type: unknown): MeshLike | null } };
      };
      const type = geometry.objectType;
      if (sameEnum(type, rhino.ObjectType.Mesh)) {
        meshes.push(geometry as unknown as MeshLike);
      } else if (sameEnum(type, rhino.ObjectType.Extrusion)) {
        const mesh = geometry.getMesh?.(rhino.MeshType.Any) ?? null;
        if (mesh) meshes.push(mesh);
        else rejectedSurfaces++;
      } else if (sameEnum(type, rhino.ObjectType.Brep)) {
        const faces = geometry.faces!();
        const parts: MeshLike[] = [];
        let ok = faces.count > 0;
        for (let f = 0; f < faces.count && ok; f++) {
          const mesh = faces.get(f).getMesh(rhino.MeshType.Any);
          if (mesh) parts.push(mesh);
          else ok = false;
        }
        if (ok) meshes.push(...parts);
        else rejectedSurfaces++;
      } else if (sameEnum(type, rhino.ObjectType.Surface) || sameEnum(type, rhino.ObjectType.SubD)) {
        rejectedSurfaces++;
      } else if (sameEnum(type, rhino.ObjectType.InstanceReference)) {
        blocks++;
      }
    }

    let triangles = 0;
    for (const mesh of meshes) {
      const faces = mesh.faces();
      for (let f = 0; f < faces.count; f++) {
        const [, , c, d] = faces.get(f);
        triangles += c === d ? 1 : 2;
      }
    }
    if (triangles > MASSING_MAX_TRIANGLES) {
      throw new MassingImportError(
        `This model has ${triangles.toLocaleString()} triangles; the limit is 500,000. Reduce the mesh in Rhino.`,
      );
    }
    if (triangles === 0) {
      throw new MassingImportError(
        rejectedSurfaces > 0
          ? "No meshes found. Surfaces need a render mesh: run _Mesh (or shade the viewport) in Rhino, then save."
          : "No meshes, extrusions or polysurfaces found in this file.",
      );
    }

    const world: number[] = [];
    const indices = new Uint32Array(triangles * 3);
    let t = 0;
    for (const mesh of meshes) {
      const base = world.length / 3;
      const vertices = mesh.vertices();
      for (let v = 0; v < vertices.count; v++) {
        // Double precision: MGA northings (~5.8e6) lose ~0.5 m in float32.
        const [x, y, z] = vertices.point3dAt(v);
        world.push(x * units.scale, y * units.scale, z * units.scale);
      }
      const faces = mesh.faces();
      for (let f = 0; f < faces.count; f++) {
        const [a, b, c, d] = faces.get(f);
        indices[t++] = base + a;
        indices[t++] = base + b;
        indices[t++] = base + c;
        if (c !== d) {
          indices[t++] = base + a;
          indices[t++] = base + c;
          indices[t++] = base + d;
        }
      }
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < world.length; i += 3) {
      minX = Math.min(minX, world[i]!);
      maxX = Math.max(maxX, world[i]!);
      minY = Math.min(minY, world[i + 1]!);
      maxY = Math.max(maxY, world[i + 1]!);
      minZ = Math.min(minZ, world[i + 2]!);
    }
    const anchor = { e: (minX + maxX) / 2, n: (minY + maxY) / 2, z: minZ };
    const positions = new Float32Array(world.length);
    for (let i = 0; i < world.length; i += 3) {
      positions[i] = world[i]! - anchor.e;
      positions[i + 1] = world[i + 1]! - anchor.n;
      positions[i + 2] = world[i + 2]! - anchor.z;
    }

    const notes: string[] = [];
    if (units.name === "unset") notes.push("File units are not set. Read as metres.");
    else if (units.scale !== 1) notes.push(`File units are ${units.name.toLowerCase()}. Scaled ×${units.scale} to metres.`);
    if (rejectedSurfaces > 0) {
      notes.push(
        `${rejectedSurfaces} surface${rejectedSurfaces === 1 ? "" : "s"} left out: no render mesh. Run _Mesh in Rhino and save, or shade the viewport before saving.`,
      );
    }
    if (blocks > 0) notes.push(`${blocks} block instance${blocks === 1 ? "" : "s"} left out. Explode blocks in Rhino first.`);
    return {
      positions,
      indices,
      triangles,
      anchor,
      halfExtent: { x: (maxX - minX) / 2, y: (maxY - minY) / 2 },
      sourceUnits: units.name,
      unitScale: units.scale,
      fileZone,
      rejectedSurfaces,
      notes,
    };
  } finally {
    doc.destroy();
  }
}

export function looksLocal(parsed: Pick<ParsedMassing, "anchor">): boolean {
  return Math.abs(parsed.anchor.e) < MGA_MIN_EASTING || Math.abs(parsed.anchor.n) < MGA_MIN_NORTHING;
}

/** Placement that reproduces the file's own MGA coordinates exactly. */
export function mgaPlacement(parsed: Pick<ParsedMassing, "anchor">): MassingPlacement {
  return { e: parsed.anchor.e, n: parsed.anchor.n, base: parsed.anchor.z, rotDeg: 0 };
}

/** MGA of the cut centre (local 0,0): the default for a model drawn in a local frame. */
export function cutCentrePlacement(model: Pick<CityModel, "center">, zone: number, base: number): MassingPlacement {
  const [e, n] = projectLocal([0, 0], model.center, zone);
  return { e, n, base, rotDeg: 0 };
}

/** MGA (E, N, Z) of vertex `i` under `placement`. Rotation is about the vertical axis through the base centre. */
export function placedMga(
  massing: Pick<ParsedMassing, "positions">,
  placement: MassingPlacement,
  i: number,
): [number, number, number] {
  const x = massing.positions[i * 3]!;
  const y = massing.positions[i * 3 + 1]!;
  const z = massing.positions[i * 3 + 2]!;
  const r = (placement.rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [placement.e + x * cos - y * sin, placement.n + x * sin + y * cos, placement.base + z];
}

/** Local CityModel frame (east, north, up) of every vertex: the exact inverse of the .3dm export. */
export function placedLocal(
  massing: Pick<ParsedMassing, "positions">,
  placement: MassingPlacement,
  origin: LonLat,
  zone: number,
): Float64Array {
  const count = massing.positions.length / 3;
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [e, n, z] = placedMga(massing, placement, i);
    const [east, north] = mgaToLocal(e, n, origin, zone);
    out[i * 3] = east;
    out[i * 3 + 1] = north;
    out[i * 3 + 2] = z;
  }
  return out;
}

/** Share of vertices outside the cut square (0–1). */
export function fractionOutsideCut(local: Float64Array, sideM: number): number {
  const half = sideM / 2;
  const count = local.length / 3;
  if (count === 0) return 0;
  let outside = 0;
  for (let i = 0; i < count; i++) {
    if (Math.abs(local[i * 3]!) > half || Math.abs(local[i * 3 + 1]!) > half) outside++;
  }
  return outside / count;
}

/** Live warnings for the Import panel. */
export function massingWarnings(
  massing: ImportedMassing,
  local: Float64Array,
  model: Pick<CityModel, "sideM">,
  cutZone: number,
): string[] {
  const out: string[] = [];
  if (massing.fileBytes > MASSING_WARN_FILE_BYTES) {
    out.push(`Large file (${(massing.fileBytes / 1048576).toFixed(0)} MB). Exports and reloads will be slow.`);
  }
  const outside = fractionOutsideCut(local, model.sideM);
  if (outside >= 0.999) out.push("The model is entirely outside this cut.");
  else if (outside > 0) out.push(`${Math.round(outside * 100)}% of the model falls outside this cut.`);
  if (massing.unitScale !== 1 || massing.sourceUnits === "unset") {
    out.push(massing.notes.find((note) => note.startsWith("File units")) ?? "File units are not metres.");
  }
  if (looksLocal(massing)) {
    out.push("Coordinates look local, not MGA 2020. Use Click to place.");
  }
  if (massing.fileZone != null && massing.fileZone !== cutZone) {
    out.push(`The file is in MGA zone ${massing.fileZone}; this cut is zone ${cutZone} (EPSG:78${cutZone}).`);
  }
  if (massing.rejectedSurfaces > 0) {
    out.push(massing.notes.find((note) => note.includes("render mesh")) ?? "Some surfaces were left out.");
  }
  return out;
}

/** Same as massingWarnings' total-limit check, before a new file is added. */
export function canAddMassing(existing: Pick<ImportedMassing, "triangles">[], triangles: number): string | null {
  if (existing.length >= MASSING_MAX_MODELS) return "Up to 20 imported models. Remove one first.";
  const total = existing.reduce((sum, item) => sum + item.triangles, 0) + triangles;
  if (total > MASSING_MAX_TRIANGLES) {
    return `Imported models would total ${total.toLocaleString()} triangles; the limit is 500,000.`;
  }
  return null;
}
