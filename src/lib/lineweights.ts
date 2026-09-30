/**
 * Pen weights for the site plan and figure-ground.
 * Values are millimetres on the printed sheet. They do not scale with the
 * drawing scale: a 0.4 mm cut line is 0.4 mm on the page at 1:500 and at 1:5000.
 *
 * | Role                         | mm   |
 * | ---------------------------- | ---- |
 * | Building outlines / cut      | 0.40 |
 * | Property and road edges      | 0.22 |
 * | Secondary detail (paths, rail) | 0.15 |
 * | Contours                     | 0.10 |
 * | Frame                        | 0.35 |
 * | Text and annotation strokes  | 0.13 |
 *
 * Contours are #B0B0B0, dashed 1.5 mm with a 0.75 mm gap, at print scale.
 * On screen, 1 mm is 96/25.4 CSS pixels at 100% zoom. The whole set is lifted
 * when the contour pen would fall under 0.6 px, and stroke widths are capped
 * at 2.4 px so a thick pen stays a line. Dash lengths use the same lift and
 * are not capped, so the 1.5 mm dash stays a dash.
 */
export const LINE_MM = {
  buildingCut: 0.4,
  propertyRoad: 0.22,
  secondary: 0.15,
  contour: 0.1,
  frame: 0.35,
  annotation: 0.13,
} as const;

export type LineRole = keyof typeof LINE_MM;

export const CONTOUR_COLOR = "#B0B0B0";
export const CONTOUR_DASH_MM = 1.5;
export const CONTOUR_GAP_MM = 0.75;

/** CSS pixels in one millimetre at 96 dpi, the usual 100% browser zoom. */
export const PX_PER_MM = 96 / 25.4;

const STROKE_MIN_PX = 0.6;
const STROKE_MAX_PX = 2.4;

function penScale(): number {
  const thin = LINE_MM.contour * PX_PER_MM;
  return thin < STROKE_MIN_PX ? STROKE_MIN_PX / thin : 1;
}

/** On-screen stroke width for a print pen, in CSS pixels. */
export function screenPx(mm: number): number {
  return Math.min(STROKE_MAX_PX, mm * PX_PER_MM * penScale());
}

/** On-screen dash or gap length. Same lift as the pens, without the stroke cap. */
export function screenDashPx(mm: number): number {
  return mm * PX_PER_MM * penScale();
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/** Points written into a PDF content stream, rounded to 1/10000 pt. */
export function pdfPt(mm: number): number {
  return Math.round(mmToPt(mm) * 10000) / 10000;
}

export function hexRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
