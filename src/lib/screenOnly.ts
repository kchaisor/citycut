import * as THREE from "three";

export const CITYCUT_SCREEN_ONLY = "citycutScreenOnly";

export function markScreenOnly(object: THREE.Object3D): void {
  object.userData[CITYCUT_SCREEN_ONLY] = true;
}

export function withScreenOnlyHidden<T>(root: THREE.Object3D, work: () => T): T {
  const hidden: THREE.Object3D[] = [];
  const lights: { light: THREE.Light; intensity: number }[] = [];
  root.traverse((object) => {
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
    for (const entry of lights) entry.light.intensity = entry.intensity;
  }
}
