import type * as THREE from "three";

type GroupRestore = { mesh: THREE.Mesh; groupIndex: number; count: number };
type VisibleRestore = { mesh: THREE.Mesh; visible: boolean };
type EdgeRestore = { object: THREE.Object3D; visible: boolean };

function matchesBuildingId(stored: unknown, targetIds: ReadonlySet<number>): boolean {
  if (stored == null) return false;
  return targetIds.has(Number(stored));
}

export function hideBuildingsForHeightEdit(root: THREE.Object3D, buildingIds: readonly number[]): () => void {
  const targetIds = new Set(buildingIds.map((id) => Number(id)));
  if (targetIds.size === 0) return () => {};
  const groupRestores: GroupRestore[] = [];
  const visibleRestores: VisibleRestore[] = [];
  const edgeRestores: EdgeRestore[] = [];
  const shadowRestores: { mesh: THREE.Mesh; castShadow: boolean }[] = [];

  root.traverse((object) => {
    if (object.name === "BuildingEdges") {
      edgeRestores.push({ object, visible: object.visible });
      object.visible = false;
    }
  });

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const batch = mesh.name || mesh.parent?.name || "";
    if (!batch.startsWith("Buildings") && !batch.startsWith("source:")) return;

    if (matchesBuildingId(mesh.userData.buildingId, targetIds)) {
      visibleRestores.push({ mesh, visible: mesh.visible });
      mesh.visible = false;
      if (mesh.castShadow) {
        shadowRestores.push({ mesh, castShadow: true });
        mesh.castShadow = false;
      }
      return;
    }

    const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
    const groups = mesh.geometry?.groups;
    if (!byGroup?.length || !groups?.length) return;
    const groupCount = Math.min(byGroup.length, groups.length);
    for (let index = 0; index < groupCount; index++) {
      if (!matchesBuildingId(byGroup[index], targetIds)) continue;
      const group = groups[index]!;
      groupRestores.push({ mesh, groupIndex: index, count: group.count });
      group.count = 0;
    }
  });

  return () => {
    for (const entry of visibleRestores) entry.mesh.visible = entry.visible;
    for (const entry of groupRestores) {
      const group = entry.mesh.geometry.groups[entry.groupIndex];
      if (group) group.count = entry.count;
    }
    for (const entry of shadowRestores) entry.mesh.castShadow = entry.castShadow;
    for (const entry of edgeRestores) entry.object.visible = entry.visible;
  };
}

export function hideBuildingForHeightEdit(root: THREE.Object3D, buildingId: number): () => void {
  return hideBuildingsForHeightEdit(root, [buildingId]);
}
