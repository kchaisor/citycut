import { getColour } from "../colours";
import type { SectionPlanMarkerGeometry } from "./marker";

export const PLAN_MARKER_BUBBLE_DIAM_PX = 16;
export const PLAN_MARKER_ARROW_PX = 9;
export const PLAN_MARKER_END_TICK_PX = 11;

export function planMetresPerCssPx(viewWidthM: number, svgClientWidthPx: number): number {
  return viewWidthM / Math.max(svgClientWidthPx, 1);
}

export function planMarkerBubbleRadiusM(metresPerCssPx: number, diameterPx = PLAN_MARKER_BUBBLE_DIAM_PX): number {
  return (diameterPx * 0.5) * metresPerCssPx;
}

export function knifeMarkerLetter(label: string): string {
  const match = label.match(/\b([A-Z])\s*$/);
  return match?.[1] ?? "A";
}

export function viewArrowTriangleEn(
  geom: SectionPlanMarkerGeometry,
  east: number,
  north: number,
  metresPerCssPx: number,
  flip = false,
): string {
  const sign = flip ? -1 : 1;
  const ve = geom.viewEast * sign;
  const vn = geom.viewNorth * sign;
  const tipDist = PLAN_MARKER_ARROW_PX * metresPerCssPx;
  const wing = PLAN_MARKER_ARROW_PX * 0.55 * metresPerCssPx;
  const tx = east + ve * tipDist;
  const ty = north + vn * tipDist;
  const px = -vn;
  const py = ve;
  const lx = east - ve * wing * 0.35 + px * wing * 0.5;
  const ly = north - vn * wing * 0.35 + py * wing * 0.5;
  const rx = east - ve * wing * 0.35 - px * wing * 0.5;
  const ry = north - vn * wing * 0.35 - py * wing * 0.5;
  return `${lx},${-ly} ${tx},${-ty} ${rx},${-ry}`;
}

export function planMarkerInk(selected: boolean): { line: string; fill: string; text: string } {
  const gold = getColour("--section-knife-marker-gold");
  const dark = getColour("--outline-building");
  if (selected) return { line: gold, fill: getColour("--sheet-fill"), text: dark };
  return { line: dark, fill: getColour("--sheet-fill"), text: dark };
}
