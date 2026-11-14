import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { flushControlInertia } from "./controlInertia";
import { studioCameraHeadingDeg } from "./studioCompass";

export const STUDIO_COMPASS_FACE_NORTH_EVENT = "citycut:compass-face-north";
export const STUDIO_COMPASS_RESET_MS = 250;

const AZIMUTH_PROBE_RAD = THREE.MathUtils.degToRad(1);

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

function headingPerAzimuthRad(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  baseAzimuth: number,
): number {
  const h0 = studioCameraHeadingDeg(camera);
  setOrbitAzimuthRad(controls, baseAzimuth + AZIMUTH_PROBE_RAD);
  const h1 = studioCameraHeadingDeg(camera);
  setOrbitAzimuthRad(controls, baseAzimuth);
  const dh = shortestHeadingDeltaDeg(h0, h1);
  if (Math.abs(dh) < 1e-5) return dh >= 0 ? 1e-4 / AZIMUTH_PROBE_RAD : -1e-4 / AZIMUTH_PROBE_RAD;
  return dh / AZIMUTH_PROBE_RAD;
}

function applyHeadingDegWithOrbitStep(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  desiredHeadingDeg: number,
): void {
  for (let i = 0; i < 4; i++) {
    const err = shortestHeadingDeltaDeg(studioCameraHeadingDeg(camera), desiredHeadingDeg);
    if (Math.abs(err) < 0.2) return;
    const base = controls.getAzimuthalAngle();
    const sens = headingPerAzimuthRad(controls, camera, base);
    if (Math.abs(sens) < 1e-6) return;
    setOrbitAzimuthRad(controls, base + THREE.MathUtils.degToRad(err) / sens);
  }
}

export function resolveAzimuthRadForHeadingDeg(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  desiredHeadingDeg: number,
): number {
  const baseAzimuth = controls.getAzimuthalAngle();
  let target = baseAzimuth;
  for (let iter = 0; iter < 8; iter++) {
    setOrbitAzimuthRad(controls, target);
    const err = shortestHeadingDeltaDeg(studioCameraHeadingDeg(camera), desiredHeadingDeg);
    if (Math.abs(err) < 0.1) break;
    const sens = headingPerAzimuthRad(controls, camera, target);
    if (Math.abs(sens) < 1e-6) break;
    target += THREE.MathUtils.degToRad(err) / sens;
  }
  const resolved = target;
  setOrbitAzimuthRad(controls, baseAzimuth);
  return resolved;
}

export function setStudioCameraHeadingWithOrbit(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  desiredHeadingDeg: number,
): void {
  const azimuth = resolveAzimuthRadForHeadingDeg(controls, camera, desiredHeadingDeg);
  setOrbitAzimuthRad(controls, azimuth);
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
  const startAzimuthRad = controls.getAzimuthalAngle();
  return {
    startAzimuthRad,
    targetAzimuthRad: startAzimuthRad,
    targetReady: false,
    elapsedMs: 0,
    controls,
    camera,
  };
}

export function tickCompassNorthAnim(anim: CompassNorthAnim, elapsedMs: number): boolean {
  if (!anim.targetReady) {
    const base = anim.startAzimuthRad;
    const h0 = studioCameraHeadingDeg(anim.camera);
    const sens = headingPerAzimuthRad(anim.controls, anim.camera, base);
    if (Math.abs(sens) > 1e-6) {
      anim.targetAzimuthRad =
        base + THREE.MathUtils.degToRad(shortestHeadingDeltaDeg(h0, 0)) / sens;
    }
    anim.targetReady = true;
  }
  anim.elapsedMs = elapsedMs;
  const progress = studioCompassNorthProgress(anim.elapsedMs);
  const delta = shortestAzimuthDeltaRad(anim.startAzimuthRad, anim.targetAzimuthRad);
  setOrbitAzimuthRad(anim.controls, anim.startAzimuthRad + delta * progress);
  if (progress >= 1) {
    setOrbitAzimuthRad(anim.controls, anim.startAzimuthRad + delta);
    applyHeadingDegWithOrbitStep(anim.controls, anim.camera, 0);
    applyHeadingDegWithOrbitStep(anim.controls, anim.camera, 0);
    return true;
  }
  return false;
}