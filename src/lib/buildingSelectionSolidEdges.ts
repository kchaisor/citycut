import type * as THREE from "three";

function matchesBuildingId(stored: unknown, targetIds: ReadonlySet<number>): boolean {
  if (stored == null) return false;
  return targetIds.has(Number(stored));
}

export function setSolidBuildingEdgesVisible(
  root: THREE.Object3D,
  buildingIds: readonly number[],
  visible: boolean,
): () => void {
  const targetIds = new Set(buildingIds.map((id) => Number(id)));
  if (targetIds.size === 0) return () => {};
  const restores: Array<{ line: THREE.LineSegments; visible: boolean }> = [];
  root.traverse((object) => {
    if (object.name !== "BuildingEdges" && object.name !== "BuildingEdge") return;
    const line = object as THREE.LineSegments;
    if (!line.isLineSegments) return;
    if (!matchesBuildingId(line.userData.buildingId, targetIds)) return;
    restores.push({ line, visible: line.visible });
    line.visible = visible;
  });
  return () => {
    for (const entry of restores) entry.line.visible = entry.visible;
  };
}

export function countSolidBuildingEdgesHidden(
  root: THREE.Object3D,
  buildingIds: readonly number[],
): number {
  const targetIds = new Set(buildingIds.map((id) => Number(id)));
  let hidden = 0;
  root.traverse((object) => {
    if (object.name !== "BuildingEdge") return;
    const line = object as THREE.LineSegments;
    if (!line.isLineSegments) return;
    if (!matchesBuildingId(line.userData.buildingId, targetIds)) return;
    if (!line.visible) hidden += 1;
  });
  return hidden;
}
