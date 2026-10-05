import * as THREE from "three";
import type { TerrainField } from "../types";
import { terrainMeshHeightAt } from "./terrain";

export type RoadTerrainMetrics = {
  vertexCount: number;
  gapMax: number;
  gapP95: number;
  tallTrisOver2m: number;
  triangleCount: number;
  meshSampleMismatchMax: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function isFlatDeck(pos: THREE.BufferAttribute, i0: number, i1: number, i2: number): boolean {
  const y0 = pos.getY(i0);
  const y1 = pos.getY(i1);
  const y2 = pos.getY(i2);
  return Math.max(y0, y1, y2) - Math.min(y0, y1, y2) < 0.05;
}

/** Arterial road meshes only; draped ribbons, not flat deck slabs. */
export function arterialRoadTerrainMetrics(
  group: THREE.Object3D,
  field: TerrainField,
  sideM: number,
  raycaster: THREE.Raycaster,
  terrainMesh: THREE.Mesh,
): RoadTerrainMetrics {
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const gaps: number[] = [];
  const mismatches: number[] = [];
  let tallTris = 0;
  let triangleCount = 0;

  function terrainRayY(east: number, north: number): number {
    origin.set(east, 5000, -north);
    raycaster.set(origin, down);
    const hits = raycaster.intersectObject(terrainMesh, false);
    if (hits.length === 0) return NaN;
    return hits[0].point.y;
  }

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== "Roads") return;
    const oc = mesh.userData.objectColor as { r: number; g: number; b: number } | undefined;
    if (!oc || oc.r !== 58 || oc.g !== 58 || oc.b !== 58) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const index = mesh.geometry.getIndex();
    const tri = (i0: number, i1: number, i2: number) => {
      if (isFlatDeck(pos, i0, i1, i2)) return;
      triangleCount += 1;
      const ys = [pos.getY(i0), pos.getY(i1), pos.getY(i2)];
      if (Math.max(...ys) - Math.min(...ys) > 2) tallTris += 1;
      for (const idx of [i0, i1, i2]) {
        const east = pos.getX(idx);
        const north = -pos.getZ(idx);
        const roadY = pos.getY(idx);
        const terrainY = terrainRayY(east, north);
        gaps.push(roadY - terrainY);
        mismatches.push(roadY - terrainMeshHeightAt(field, east, north, sideM));
      }
    };
    if (index) {
      for (let i = 0; i < index.count; i += 3) tri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) tri(i, i + 1, i + 2);
    }
  });

  gaps.sort((a, b) => a - b);
  mismatches.sort((a, b) => a - b);
  return {
    vertexCount: gaps.length,
    gapMax: gaps[gaps.length - 1] ?? 0,
    gapP95: percentile(gaps, 0.95),
    tallTrisOver2m: tallTris,
    triangleCount,
    meshSampleMismatchMax: mismatches[mismatches.length - 1] ?? 0,
  };
}
