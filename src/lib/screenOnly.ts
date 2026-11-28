import * as THREE from "three";

export const CITYCUT_SCREEN_ONLY = "citycutScreenOnly";

export const CITYCUT_EXPORT_ONLY = "citycutExportOnly";

export function markExportOnly(object: THREE.Object3D): void {
  object.userData[CITYCUT_EXPORT_ONLY] = true;
}

export function markScreenOnly(object: THREE.Object3D): void {
  object.userData[CITYCUT_SCREEN_ONLY] = true;
}

export function withScreenOnlyHidden<T>(root: THREE.Object3D, work: () => T): T {
  const hidden: THREE.Object3D[] = [];
  const revealed: THREE.Object3D[] = [];
  const lights: { light: THREE.Light; intensity: number }[] = [];
  root.traverse((object) => {
    if (object.userData[CITYCUT_EXPORT_ONLY] && !object.visible) {
      object.visible = true;
      revealed.push(object);
    }
    if (!object.userData[CITYCUT_SCREEN_ONLY]) return;
    const light = object as THREE.Light;
    if (light.isLight) {
      lights.push({ light, intensity: light.intensity });
      light.intensity = 0;
      return;
    }
    if (object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
  try {
    return work();
  } finally {
    for (const object of hidden) object.visible = true;
    for (const object of revealed) object.visible = false;
    for (const entry of lights) entry.light.intensity = entry.intensity;
  }
}
