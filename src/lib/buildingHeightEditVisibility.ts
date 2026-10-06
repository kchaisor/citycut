import type * as THREE from "three";

type GroupRestore = { mesh: THREE.Mesh; groupIndex: number; count: number };
type VisibleRestore = { mesh: THREE.Mesh; visible: boolean };
type EdgeRestore = { object: THREE.Object3D; visible: boolean };

/** Hide the picked footprint in the city group while the height popover is open. Restores on cleanup. */
export function hideBuildingForHeightEdit(root: THREE.Object3D, buildingId: number): () => void {
  const groupRestores: GroupRestore[] = [];
  const visibleRestores: VisibleRestore[] = [];
  const edgeRestores: EdgeRestore[] = [];

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

    if (mesh.userData.buildingId === buildingId) {
      visibleRestores.push({ mesh, visible: mesh.visible });
      mesh.visible = false;
      return;
    }

    const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
    const groups = mesh.geometry?.groups;
    if (!byGroup?.length || !groups?.length) return;
    for (let index = 0; index < groups.length; index++) {
      if (byGroup[index] !== buildingId) continue;
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
    for (const entry of edgeRestores) entry.object.visible = entry.visible;
  };
}
