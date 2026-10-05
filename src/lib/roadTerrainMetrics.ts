import type { Object3D, Mesh, BufferAttribute } from "three";
import type { TerrainField } from "../types";
import { terrainMeshHeightAt } from "./terrain";

export type RoadTerrainMetrics = {
  vertexCount: number;
  gapMax: number;
  gapP95: number;
  tallTrisOver2m: number;
  triangleCount: number;
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
  let tallTris = 0;
  let triangleCount = 0;

  group.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || (mesh.name !== "Roads" && mesh.name !== "Rail")) return;
    if (mesh.userData.deck === true) return;
    const pos = mesh.geometry.getAttribute("position") as BufferAttribute;
    const index = mesh.geometry.getIndex();
    const visit = (i0: number, i1: number, i2: number) => {
      triangleCount += 1;
      const ys = [pos.getY(i0), pos.getY(i1), pos.getY(i2)];
      if (Math.max(...ys) - Math.min(...ys) > 2) tallTris += 1;
      for (const idx of [i0, i1, i2]) {
        const east = pos.getX(idx);
        const north = -pos.getZ(idx);
        gaps.push(pos.getY(idx) - terrainMeshHeightAt(field, east, north, sideM));
      }
    };
    if (index) {
      for (let i = 0; i + 2 < index.count; i += 3) visit(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) visit(i, i + 1, i + 2);
    }
  });

  gaps.sort((a, b) => a - b);
  return {
    vertexCount: gaps.length,
    gapMax: gaps.length ? Math.max(...gaps) : 0,
    gapP95: percentile(gaps, 0.95),
    tallTrisOver2m: tallTris,
    triangleCount,
  };
}
