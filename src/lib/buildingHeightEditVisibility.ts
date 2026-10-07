import type * as THREE from "three";

type GroupRestore = { mesh: THREE.Mesh; groupIndex: number; count: number };
type VisibleRestore = { mesh: THREE.Mesh; visible: boolean };
type EdgeRestore = { object: THREE.Object3D; visible: boolean };

function sameBuildingId(stored: unknown, buildingId: number): boolean {
  if (stored == null) return false;
  return Number(stored) === buildingId;
}

/** Hide the picked footprint in the city group while the height popover is open. Restores on cleanup. */
export function hideBuildingForHeightEdit(root: THREE.Object3D, buildingId: number): () => void {
  const targetId = Number(buildingId);
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

    if (sameBuildingId(mesh.userData.buildingId, targetId)) {
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
      if (!sameBuildingId(byGroup[index], targetId)) continue;
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
