import * as THREE from "three";

const worldNorth = new THREE.Vector3(0, 0, -1);
const scratchX = new THREE.Vector3();
const scratchY = new THREE.Vector3();
const scratchZ = new THREE.Vector3();

export function studioNorthNeedleDeg(camera: THREE.Camera): number {
  camera.matrixWorld.extractBasis(scratchX, scratchY, scratchZ);
  const dx = worldNorth.dot(scratchX);
  const dy = worldNorth.dot(scratchY);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function studioCompassVisible(projection: "perspective" | "iso" | "plan", freeRotate: boolean): boolean {
  if (projection === "perspective") return true;
  if (projection === "iso" && freeRotate) return true;
  if (projection === "plan") return true;
  return false;
}
