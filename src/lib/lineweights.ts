import { COLOUR_FALLBACK } from "./colours";
import { drawingSheetColor } from "./drawingSheet";

/**
 * Fallback pen weights. The site plan, on screen and in the Illustrator
 * file, reads src/drawing-style.css (see readDrawingStyle). These numbers
 * are used only when a CSS variable is missing, and for the figure-ground
 * sheet, which stays black. They do not scale with the drawing scale: a
 * 0.35 mm frame is 0.35 mm on the page at 1:500 and at 1:5000.
 *
 * | Role                         | mm   |
 * | ---------------------------- | ---- |
 * | Building outlines / cut      | 0    |
 * | Property and road edges      | 0.22 |
 * | Path edge and rail          | 0.15 |
 * | Contours                     | 0.10 |
 * | Frame                        | 0.35 |
 * | Text and annotation strokes  | 0.13 |
 *
 * A weight of 0 is no stroke. On screen it is not lifted to the 0.6 px floor.
 * In a PDF a line width of 0 is a device hairline, so callers omit the stroke
 * and paint a fill only (`f` / `f*`) instead of writing `0 w`.
 *
 * Contours use the contour stroke from drawing-style.css, dashed 1.5 mm with a 0.75 mm gap, at print scale.
 * On screen, 1 mm is 96/25.4 CSS pixels at 100% zoom. The whole set is lifted
 * when the contour pen would fall under 0.6 px, and stroke widths are capped
 * at 2.4 px so a thick pen stays a line. Dash lengths use the same lift and
 * are not capped, so the 1.5 mm dash stays a dash.
 */
export const LINE_MM = {
  /** 0 means no building outline. A positive value is the cut line, in millimetres. */
  buildingCut: 0,
  propertyRoad: 0.22,
  secondary: 0.15,
  contour: 0.1,
  frame: 0.35,
  annotation: 0.13,
} as const;

export type LineRole = keyof typeof LINE_MM;

/**
 * Footpath strip on the ground. 1.2 m is 0.6 m each side of the centreline.
 * The width is metres in map space, so it scales with zoom and with the sheet scale.
 * The footpath fill in colours.css is only slightly darker than the page and clearly lighter than the road.
 */
export const PATH_WIDTH_M = 1.2;
export const PATH_FILL = COLOUR_FALLBACK["--path-fill"];

export const CONTOUR_COLOR = drawingSheetColor("--contour-stroke");
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

/**
 * On-screen stroke width for a print pen, in CSS pixels.
 * Positive weights share the contour lift (at least 0.6 px) and the 2.4 px cap.
 * Zero bypasses that floor and stays 0, which is no stroke.
 */
export function screenPx(mm: number): number {
  if (!(mm > 0)) return 0;
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
