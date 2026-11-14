import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { flushControlInertia } from "./controlInertia";
import { studioCameraHeadingDeg } from "./studioCompass";

export const STUDIO_COMPASS_FACE_NORTH_EVENT = "citycut:compass-face-north";
export const STUDIO_COMPASS_RESET_MS = 250;

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

export function shortestHeadingDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = toDeg - fromDeg;
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return d;
}

export function syncOrbitControlsFromCamera(controls: OrbitControlsImpl): void {
  flushControlInertia(controls);
  controls.update();
}

export function setStudioCameraHeadingWithOrbit(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  desiredHeadingDeg: number,
): void {
  const baseAzimuth = controls.getAzimuthalAngle();
  let bestDelta = 0;
  let bestErr = Infinity;
  for (let step = -360; step <= 360; step++) {
    const delta = THREE.MathUtils.degToRad(step);
    controls.setAzimuthalAngle(baseAzimuth + delta);
    flushControlInertia(controls);
    controls.update();
    const err = Math.abs(shortestHeadingDeltaDeg(studioCameraHeadingDeg(camera), desiredHeadingDeg));
    if (err < bestErr) {
      bestErr = err;
      bestDelta = delta;
    }
    if (err < 0.04) break;
  }
  controls.setAzimuthalAngle(baseAzimuth + bestDelta);
  flushControlInertia(controls);
  controls.update();
}

export type CompassNorthAnim = {
  startHeadingDeg: number;
  elapsedMs: number;
  controls: OrbitControlsImpl;
  camera: THREE.Camera;
};

export function beginCompassNorthAnim(controls: OrbitControlsImpl, camera: THREE.Camera): CompassNorthAnim {
  return {
    startHeadingDeg: studioCameraHeadingDeg(camera),
    elapsedMs: 0,
    controls,
    camera,
  };
}

export function tickCompassNorthAnim(anim: CompassNorthAnim, deltaMs: number): boolean {
  anim.elapsedMs += deltaMs;
  const progress = studioCompassNorthProgress(anim.elapsedMs);
  const desiredHeading = anim.startHeadingDeg * (1 - progress);
  setStudioCameraHeadingWithOrbit(anim.controls, anim.camera, desiredHeading);
  if (progress >= 1) {
    setStudioCameraHeadingWithOrbit(anim.controls, anim.camera, 0);
    return true;
  }
  return false;
}