import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { flushControlInertia } from "./controlInertia";
import { studioCameraHeadingDeg } from "./studioCompass";

export const STUDIO_COMPASS_FACE_NORTH_EVENT = "citycut:compass-face-north";
export const STUDIO_COMPASS_RESET_MS = 250;

export const STUDIO_COMPASS_NORTH_TWEEN_KEY = "__citycutCompassNorthTween";

export function setCompassNorthTweenActive(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) {
    (window as Window & { [STUDIO_COMPASS_NORTH_TWEEN_KEY]?: boolean })[STUDIO_COMPASS_NORTH_TWEEN_KEY] = true;
  } else {
    delete (window as Window & { [STUDIO_COMPASS_NORTH_TWEEN_KEY]?: boolean })[STUDIO_COMPASS_NORTH_TWEEN_KEY];
  }
}

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

export function shortestAzimuthDeltaRad(fromRad: number, toRad: number): number {
  let d = toRad - fromRad;
  d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return d;
}

export function syncOrbitControlsFromCamera(controls: OrbitControlsImpl): void {
  flushControlInertia(controls);
  controls.update();
}

export function clearOrbitControlInertia(controls: OrbitControlsImpl): void {
  const damp = controls.enableDamping;
  controls.enableDamping = false;
  try {
    flushControlInertia(controls);
    controls.update();
    flushControlInertia(controls);
    controls.update();
  } finally {
    controls.enableDamping = damp;
  }
}

export function setOrbitAzimuthRad(controls: OrbitControlsImpl, azimuthRad: number): void {
  const damp = controls.enableDamping;
  controls.enableDamping = false;
  try {
    controls.setAzimuthalAngle(azimuthRad);
    flushControlInertia(controls);
    controls.update();
  } finally {
    controls.enableDamping = damp;
  }
}

function scoreHeadingError(camera: THREE.Camera, desiredHeadingDeg: number): number {
  return Math.abs(shortestHeadingDeltaDeg(studioCameraHeadingDeg(camera), desiredHeadingDeg));
}

export function computeAzimuthRadForHeadingDeg(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  desiredHeadingDeg: number,
): number {
  const base = controls.getAzimuthalAngle();
  if (scoreHeadingError(camera, desiredHeadingDeg) < 0.08) return base;
  let best = base;
  let bestErr = Infinity;
  for (let deg = -180; deg < 180; deg += 12) {
    const trial = base + THREE.MathUtils.degToRad(deg);
    setOrbitAzimuthRad(controls, trial);
    const err = scoreHeadingError(camera, desiredHeadingDeg);
    if (err < bestErr) {
      bestErr = err;
      best = trial;
    }
    if (err < 0.08) break;
  }
  for (let deg = -12; deg <= 12; deg += 2) {
    const trial = best + THREE.MathUtils.degToRad(deg);
    setOrbitAzimuthRad(controls, trial);
    const err = scoreHeadingError(camera, desiredHeadingDeg);
    if (err < bestErr) {
      bestErr = err;
      best = trial;
    }
    if (err < 0.05) break;
  }
  setOrbitAzimuthRad(controls, base);
  return best;
}

export function computeNorthAzimuthRadFromGeometry(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
): number {
  return computeAzimuthRadForHeadingDeg(controls, camera, 0);
}

export function setStudioCameraHeadingWithOrbit(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  desiredHeadingDeg: number,
): void {
  setOrbitAzimuthRad(controls, computeAzimuthRadForHeadingDeg(controls, camera, desiredHeadingDeg));
}

export type CompassNorthAnim = {
  startAzimuthRad: number;
  targetAzimuthRad: number;
  targetReady: boolean;
  elapsedMs: number;
  controls: OrbitControlsImpl;
  camera: THREE.Camera;
};

export function beginCompassNorthAnim(controls: OrbitControlsImpl, camera: THREE.Camera): CompassNorthAnim {
  return {
    startAzimuthRad: controls.getAzimuthalAngle(),
    targetAzimuthRad: controls.getAzimuthalAngle(),
    targetReady: false,
    elapsedMs: 0,
    controls,
    camera,
  };
}

export function tickCompassNorthAnim(anim: CompassNorthAnim, elapsedMs: number): boolean {
  if (!anim.targetReady) {
    anim.targetAzimuthRad = computeNorthAzimuthRadFromGeometry(anim.controls, anim.camera);
    anim.targetReady = true;
    clearOrbitControlInertia(anim.controls);
  }
  anim.elapsedMs = elapsedMs;
  const progress = studioCompassNorthProgress(anim.elapsedMs);
  const delta = shortestAzimuthDeltaRad(anim.startAzimuthRad, anim.targetAzimuthRad);
  setOrbitAzimuthRad(anim.controls, anim.startAzimuthRad + delta * progress);
  if (progress >= 1) {
    setOrbitAzimuthRad(anim.controls, anim.startAzimuthRad + delta);
    return true;
  }
  return false;
}