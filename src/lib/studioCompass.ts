import * as THREE from "three";

const worldNorth = new THREE.Vector3(0, 0, -1);
const scratchX = new THREE.Vector3();
const scratchY = new THREE.Vector3();
const scratchZ = new THREE.Vector3();

export function studioNorthNeedleDeg(camera: THREE.Camera): number {
  return studioCompassNeedleDeg(studioCameraHeadingDeg(camera));
}

export function studioCameraHeadingDeg(camera: THREE.Camera): number {
  camera.matrixWorld.extractBasis(scratchX, scratchY, scratchZ);
  const dx = worldNorth.dot(scratchX);
  const dy = worldNorth.dot(scratchY);
  const needle = (Math.atan2(dx, dy) * 180) / Math.PI;
  return -needle;
}

export function studioCompassNeedleDeg(cameraHeadingDeg: number): number {
  return -cameraHeadingDeg;
}

export function studioCompassAriaLabel(cameraHeadingDeg: number): string {
  const deg = Math.round(((cameraHeadingDeg % 360) + 360) % 360);
  return `North. View heading ${deg} degrees. Activate to face north.`;
}

export const STUDIO_COMPASS_INSET_PX = 16;
export const STUDIO_COMPASS_HIT_PX = 44;
export const STUDIO_COMPASS_GAP_PX = 16;

export function studioCompassVisible(projection: "perspective" | "iso" | "plan", freeRotate: boolean): boolean {
  if (projection === "perspective") return true;
  if (projection === "iso" && freeRotate) return true;
  if (projection === "plan") return true;
  return false;
}
