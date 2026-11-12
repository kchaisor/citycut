import * as THREE from "three";
import { getColour } from "./colours";
import { applyMatteFinish } from "./matteMaterial";

export function uniformRoadColor(): string {
  return getColour("--uniform-road");
}

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

export function applyUniformRoadTint(root: THREE.Object3D, uniformRoadsOn: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== "Roads") return;
    const grade = mesh.userData.roadGrade as string | undefined;
    if (grade === "path") return;
    forEachStandardMaterial(mesh, (material) => {
      const rest = material.userData.primaryRestHex as string | undefined;
      if (!rest) return;
      material.color.setStyle(uniformRoadsOn ? uniformRoadColor() : rest);
      applyMatteFinish(material);
    });
  });
}
