import * as THREE from "three";
import { getColour } from "./colours";

type SavedSurface = {
  colorHex: string;
  vertexColors?: Float32Array;
};

function surfaceNames(name: string): boolean {
  return name === "Ground" || name === "Terrain" || name === "BasePlinth";
}

export function applySignalTraceSurfaceTint(root: THREE.Object3D, on: boolean): void {
  const dark = getColour("--signal-trace-ground");
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !surfaceNames(mesh.name)) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    if (!mesh.userData.signalTraceSurfaceSaved) {
      const attr = mesh.geometry.getAttribute("color");
      const saved: SavedSurface = { colorHex: `#${material.color.getHexString()}` };
      if (attr instanceof THREE.BufferAttribute) {
        saved.vertexColors = new Float32Array(attr.array);
      }
      mesh.userData.signalTraceSurfaceSaved = saved;
    }
    const saved = mesh.userData.signalTraceSurfaceSaved as SavedSurface;
    if (on) {
      material.color.setStyle(dark);
      material.vertexColors = false;
      const attr = mesh.geometry.getAttribute("color");
      if (attr instanceof THREE.BufferAttribute) {
        const c = new THREE.Color(dark);
        for (let i = 0; i < attr.count; i++) {
          attr.setXYZ(i, c.r, c.g, c.b);
        }
        attr.needsUpdate = true;
      }
      material.needsUpdate = true;
      return;
    }
    material.color.setStyle(saved.colorHex);
    if (saved.vertexColors) {
      const attr = mesh.geometry.getAttribute("color");
      if (attr instanceof THREE.BufferAttribute && attr.array.length === saved.vertexColors.length) {
        attr.array.set(saved.vertexColors);
        attr.needsUpdate = true;
      }
      material.vertexColors = true;
    }
    material.needsUpdate = true;
  });
}
