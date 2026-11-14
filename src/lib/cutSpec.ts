import { A3_LONG_MM, A3_SHORT_MM } from "./figureGround";
import type { SheetOrientation } from "./figureGround";

export type CutShape = "square" | "circle" | "a3";

export type CutOrientation = SheetOrientation;

export const A3_DRAWING_SCALES = [1000, 2000, 2500, 3000, 3500, 5000] as const;

export type A3DrawingScale = (typeof A3_DRAWING_SCALES)[number];

export const A3_ASPECT = A3_LONG_MM / A3_SHORT_MM;

export type CutSpec = {
  shape: CutShape;
  orientation: CutOrientation;
  scale?: A3DrawingScale;
  widthM: number;
  heightM: number;
};

export function a3GroundMetres(scale: number, orientation: CutOrientation): { widthM: number; heightM: number } {
  const longM = (A3_LONG_MM * scale) / 1000;
  const shortM = (A3_SHORT_MM * scale) / 1000;
  if (orientation === "landscape") return { widthM: longM, heightM: shortM };
  return { widthM: shortM, heightM: longM };
}

export function cutSpecFromA3(scale: A3DrawingScale, orientation: CutOrientation): CutSpec {
  const { widthM, heightM } = a3GroundMetres(scale, orientation);
  return { shape: "a3", orientation, scale, widthM, heightM };
}

export function cutSpecFromSquare(sideM: number): CutSpec {
  return { shape: "square", orientation: "landscape", widthM: sideM, heightM: sideM };
}

export function cutSpecFromCircle(diameterM: number): CutSpec {
  return { shape: "circle", orientation: "landscape", widthM: diameterM, heightM: diameterM };
}

export function cutSpecSideM(spec: CutSpec): number {
  return Math.max(spec.widthM, spec.heightM);
}

export function cutSpecAreaM2(spec: CutSpec): number {
  if (spec.shape === "circle") return Math.PI * (spec.widthM / 2) ** 2;
  return spec.widthM * spec.heightM;
}

export function formatCutReadout(spec: CutSpec): string {
  const w = Math.round(spec.widthM).toLocaleString();
  const h = Math.round(spec.heightM).toLocaleString();
  if (spec.shape === "a3" && spec.scale) return `${w} × ${h} m · A3 @ 1:${spec.scale}`;
  if (spec.shape === "circle") return `${Math.round(spec.widthM).toLocaleString()} m diameter`;
  if (Math.abs(spec.widthM - spec.heightM) < 0.01) return `${w} × ${w} m`;
  return `${w} × ${h} m`;
}

export function a3RatioLockedDrag(
  eastM: number,
  northM: number,
  orientation: CutOrientation,
): { widthM: number; heightM: number } {
  const ratio = orientation === "landscape" ? A3_ASPECT : 1 / A3_ASPECT;
  if (eastM / Math.max(northM, 1e-9) >= ratio) {
    return { widthM: eastM, heightM: eastM / ratio };
  }
  return { widthM: northM * ratio, heightM: northM };
}

export function defaultA3Scale(): A3DrawingScale {
  return 2500;
}

export function closestA3ScaleForSideM(targetSideM: number, orientation: CutOrientation): A3DrawingScale {
  let best: A3DrawingScale = defaultA3Scale();
  let bestDelta = Infinity;
  for (const scale of A3_DRAWING_SCALES) {
    const sideM = cutSpecSideM(cutSpecFromA3(scale, orientation));
    const delta = Math.abs(sideM - targetSideM);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = scale;
    }
  }
  return best;
}
