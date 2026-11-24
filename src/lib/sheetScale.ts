import type * as THREE from "three";
import { studioNorthNeedleDeg } from "./studioCompass";

export type SheetFrame = { metresAcross: number; northRad: number | null; cutM?: { width: number; height: number } };

export const SCALE_BAR_SHARE = 0.175;

const ROUND_MANTISSAS = [1, 2, 2.5, 5] as const;

export function orthoMetresPerCssPx(camera: Pick<THREE.OrthographicCamera, "top" | "bottom" | "zoom">, cssHeight: number): number {
  return (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-9) / Math.max(cssHeight, 1);
}

export function roundScaleLength(targetM: number): number {
  if (!(targetM > 0)) return 0;
  const decade = Math.floor(Math.log10(targetM));
  let best = 0;
  let bestError = Infinity;
  for (const exponent of [decade - 1, decade, decade + 1]) {
    for (const mantissa of ROUND_MANTISSAS) {
      const length = mantissa * 10 ** exponent;
      const error = Math.abs(Math.log(length / targetM));
      if (error < bestError) {
        best = length;
        bestError = error;
      }
    }
  }
  return best;
}

export function scaleBarLengthM(metresAcross: number, share = SCALE_BAR_SHARE): number {
  return roundScaleLength(metresAcross * share);
}

export function northAngleRad(camera: THREE.Camera): number | null {
  const ortho = camera as THREE.OrthographicCamera;
  if (!ortho.isOrthographicCamera) return null;
  const needle = (studioNorthNeedleDeg(camera) * Math.PI) / 180;
  return Number.isFinite(needle) ? needle : null;
}

export function planSheetFrame(camera: THREE.Camera, cssHeight: number, cropCssWidth: number): SheetFrame | null {
  const ortho = camera as THREE.OrthographicCamera;
  if (!ortho.isOrthographicCamera) return null;
  const metresAcross = orthoMetresPerCssPx(ortho, cssHeight) * cropCssWidth;
  if (!(metresAcross > 0) || !Number.isFinite(metresAcross)) return null;
  return { metresAcross, northRad: northAngleRad(camera) };
}
