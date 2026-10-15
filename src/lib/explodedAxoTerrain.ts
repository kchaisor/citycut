import { sampleTerrain } from "./terrain";
import { clipPolylineSiteFrame, DEFAULT_SITE_FRAME_SHAPE } from "./siteFrame";
import type { CityModel, Pt, TerrainField } from "../types";

/** Default vertical exaggeration for the terrain mesh plate. */
export const DEFAULT_AXO_TERRAIN_EXAGGERATION = 3;
export const AXO_TERRAIN_EXAGGERATION_RANGE = { min: 1, max: 10, step: 0.5 } as const;
/** Grid lines per direction across the frame. */
export const AXO_TERRAIN_GRID_LINES = 28;

const COS30 = Math.sqrt(3) / 2;
const round = (v: number) => Math.round(v * 100) / 100;

function iso(east: number, north: number, upM: number): Pt {
  return [(east - north) * COS30, (east + north) * 0.5 - upM];
}

function densify(line: Pt[], stepM: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / stepM));
    for (let k = 0; k < n; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(line[line.length - 1]!);
  return out;
}

/**
 * Terrain (DTM) mesh grid: east and north lines across the frame, each point lifted by
 * (elevation − field minimum) × exaggeration. Iso base coords (lift 0 = plate).
 */
export function buildAxoTerrainMesh(
  model: CityModel,
  field: TerrainField,
  exaggeration = DEFAULT_AXO_TERRAIN_EXAGGERATION,
  gridLines = AXO_TERRAIN_GRID_LINES,
): string[] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const half = model.sideM / 2;
  const step = model.sideM / gridLines;
  const paths: string[] = [];
  const lift = (e: number, n: number) => (sampleTerrain(field, e, n, model.sideM) - field.min) * exaggeration;
  for (let i = 0; i <= gridLines; i += 1) {
    const t = -half + i * step;
    const lines: Pt[][] = [
      [
        [t, -half],
        [t, half],
      ],
      [
        [-half, t],
        [half, t],
      ],
    ];
    for (const line of lines) {
      for (const part of clipPolylineSiteFrame(line, model.sideM, shape)) {
        const pts = densify(part, step / 2).map(([e, n]) => iso(e, n, lift(e, n)));
        if (pts.length < 2) continue;
        paths.push(pts.map((p, k) => `${k === 0 ? "M" : "L"}${round(p[0])} ${round(p[1])}`).join(" "));
      }
    }
  }
  return paths;
}

export function axoTerrainNote(field: TerrainField, exaggeration: number): string {
  const relief = Math.round((field.max - field.min) * 10) / 10;
  return `Terrain: ${field.source || "Mapterhorn"} DEM, relief ${relief} m, ×${exaggeration} vertical`;
}

export const AXO_TERRAIN_UNAVAILABLE_NOTE = "Terrain unavailable: Mapterhorn tiles could not be loaded";
