import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { flushControlInertia } from "./controlInertia";
import { studioCameraHeadingDeg } from "./studioCompass";

export const STUDIO_COMPASS_FACE_NORTH_EVENT = "citycut:compass-face-north";
export const STUDIO_COMPASS_RESET_MS = 250;

const up = new THREE.Vector3(0, 1, 0);
const scratchOffset = new THREE.Vector3();

export function studioCompassEaseOut(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 1 - (1 - u) * (1 - u);
}

export function studioCompassNorthProgress(elapsedMs: number, durationMs = STUDIO_COMPASS_RESET_MS): number {
  return studioCompassEaseOut(elapsedMs / durationMs);
}

export function dispatchStudioCompassFaceNorth(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDIO_COMPASS_FACE_NORTH_EVENT));
}

export function rotateCameraYaw(
  camera: THREE.Camera,
  target: THREE.Vector3,
  deltaRad: number,
): void {
  scratchOffset.copy(camera.position).sub(target);
  scratchOffset.applyAxisAngle(up, deltaRad);
  camera.position.copy(target).add(scratchOffset);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

export type CompassNorthAnim = {
  startHeadingDeg: number;
  elapsedMs: number;
  controls: OrbitControlsImpl;
  camera: THREE.Camera;
  startPosition: THREE.Vector3;
};

export function beginCompassNorthAnim(controls: OrbitControlsImpl, camera: THREE.Camera): CompassNorthAnim {
  return {
    startHeadingDeg: studioCameraHeadingDeg(camera),
    elapsedMs: 0,
    controls,
    camera,
    startPosition: camera.position.clone(),
  };
}

export function tickCompassNorthAnim(anim: CompassNorthAnim, deltaMs: number): boolean {
  anim.elapsedMs += deltaMs;
  const progress = studioCompassNorthProgress(anim.elapsedMs);
  const deltaRad = THREE.MathUtils.degToRad(-anim.startHeadingDeg * progress);
  anim.camera.position.copy(anim.startPosition);
  rotateCameraYaw(anim.camera, anim.controls.target, deltaRad);
  flushControlInertia(anim.controls);
  anim.controls.update();
  if (progress >= 1) {
    const residual = studioCameraHeadingDeg(anim.camera);
    if (Math.abs(residual) > 0.05) {
      rotateCameraYaw(anim.camera, anim.controls.target, THREE.MathUtils.degToRad(-residual));
      flushControlInertia(anim.controls);
      anim.controls.update();
    }
    return true;
  }
  return false;
}