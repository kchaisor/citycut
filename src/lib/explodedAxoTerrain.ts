import { clipLine, frameHalfExtents, siteFrameGround } from "./siteFrame";
import { siteFrameFromModel } from "./modelFrame";
import { isoSvgPolyline, planPointToIso } from "./explodedAxo";
import { sampleTerrain } from "./terrain";
import type { CityModel, Pt, TerrainField } from "../types";

export const AXO_TERRAIN_UNAVAILABLE_NOTE = "Terrain DEM unavailable";

export const DEFAULT_AXO_TERRAIN_EXAGGERATION = 3;

export const AXO_TERRAIN_EXAGGERATION_RANGE = { min: 1, max: 10, step: 0.5 } as const;

const MESH_DIVISIONS = 20;

export function buildAxoTerrainMesh(
  model: CityModel,
  field: TerrainField,
  exaggeration = DEFAULT_AXO_TERRAIN_EXAGGERATION,
  divisions = MESH_DIVISIONS,
): string[] {
  const sideM = model.sideM;
  const frame = siteFrameFromModel(model);
  const { halfW, halfH } = frameHalfExtents(frame.sideM, frame.shape, siteFrameGround(frame));
  const base = field.min;
  const ex = Math.max(0, exaggeration);
  const subDivisions = divisions * 2;

  const lines: Pt[][] = [];
  for (let i = 0; i <= divisions; i += 1) {
    const c = -halfW + (i * (halfW * 2)) / divisions;
    const eastLine: Pt[] = [];
    const northLine: Pt[] = [];
    for (let j = 0; j <= subDivisions; j += 1) {
      const t = -halfH + (j * (halfH * 2)) / subDivisions;
      eastLine.push([c, t]);
      northLine.push([t, c]);
    }
    lines.push(eastLine, northLine);
  }

  const out: string[] = [];
  for (const line of lines) {
    for (const part of clipLine(frame, line)) {
      if (part.length < 2) continue;
      const iso = part.map((pt) => {
        const lift = Math.max(0, (sampleTerrain(field, pt[0], pt[1], sideM) - base) * ex);
        return planPointToIso(pt[0], pt[1], lift);
      });
      const d = isoSvgPolyline(iso, false);
      if (d) out.push(d);
    }
  }
  return out;
}

export function axoTerrainNote(field: TerrainField, exaggeration = DEFAULT_AXO_TERRAIN_EXAGGERATION): string {
  const relief = Math.max(0, Math.round(field.max - field.min));
  return `Terrain: Mapterhorn DEM, relief ${relief} m, ×${exaggeration} vertical`;
}
