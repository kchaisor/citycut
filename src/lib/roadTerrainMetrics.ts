import type { Object3D, Mesh, BufferAttribute } from "three";
import type { TerrainField } from "../types";
import { terrainMeshHeightAt } from "./terrain";

export type RoadTerrainMetrics = {
  vertexCount: number;
  gapMax: number;
  gapP95: number;
  tallTrisOver2m: number;
  triangleCount: number;
  arterialTallTrisOver2m: number;
  arterialTriangleCount: number;
  arterialGapMax: number;
  arterialGapP95: number;
  worstTall: { east: number; north: number; extent: number } | null;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

/**
 * Draped (non-deck) road and rail vertices vs the rendered terrain mesh.
 * Gap is road Z minus mesh Z, so the per-class lift is included.
 */
export function drapedRoadTerrainMetrics(
  group: Object3D,
  field: TerrainField,
  sideM: number,
): RoadTerrainMetrics {
  const gaps: number[] = [];
  const arterialGaps: number[] = [];
  let tallTris = 0;
  let triangleCount = 0;
  let arterialTall = 0;
  let arterialTris = 0;
  let worstTall: { east: number; north: number; extent: number } | null = null;

  group.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || (mesh.name !== "Roads" && mesh.name !== "Rail")) return;
    if (mesh.userData.deck === true) return;
    const oc = mesh.userData.objectColor as { r: number; g: number; b: number } | undefined;
    const arterial = mesh.name === "Roads" && oc != null && oc.r === 58 && oc.g === 58 && oc.b === 58;
    const pos = mesh.geometry.getAttribute("position") as BufferAttribute;
    const index = mesh.geometry.getIndex();
    const visit = (i0: number, i1: number, i2: number) => {
      triangleCount += 1;
      const ys = [pos.getY(i0), pos.getY(i1), pos.getY(i2)];
      const extent = Math.max(...ys) - Math.min(...ys);
      const tall = extent > 2;
      if (tall) {
        tallTris += 1;
        const east = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
        const north = -(pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
        if (!worstTall || extent > worstTall.extent) worstTall = { east, north, extent };
      }
      if (arterial) {
        arterialTris += 1;
        if (tall) arterialTall += 1;
      }
      for (const idx of [i0, i1, i2]) {
        const east = pos.getX(idx);
        const north = -pos.getZ(idx);
        const gap = pos.getY(idx) - terrainMeshHeightAt(field, east, north, sideM);
        gaps.push(gap);
        if (arterial) arterialGaps.push(gap);
      }
    };
    if (index) {
      for (let i = 0; i + 2 < index.count; i += 3) visit(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) visit(i, i + 1, i + 2);
    }
  });

  const maxOf = (values: number[]) => {
    let max = 0;
    for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
    return max;
  };
  gaps.sort((a, b) => a - b);
  arterialGaps.sort((a, b) => a - b);
  return {
    vertexCount: gaps.length,
    gapMax: maxOf(gaps),
    gapP95: percentile(gaps, 0.95),
    tallTrisOver2m: tallTris,
    triangleCount,
    arterialTallTrisOver2m: arterialTall,
    arterialTriangleCount: arterialTris,
    arterialGapMax: maxOf(arterialGaps),
    arterialGapP95: percentile(arterialGaps, 0.95),
    worstTall,
  };
}
