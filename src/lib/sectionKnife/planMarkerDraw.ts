import { getColour } from "../colours";
import type { SectionPlanMarkerClip, SectionPlanMarkerGeometry } from "./marker";

export const PLAN_MARKER_BUBBLE_DIAM_PX = 17;
export const PLAN_MARKER_BUBBLE_DIAM_MIN_PX = 14;
export const PLAN_MARKER_BUBBLE_DIAM_MAX_PX = 20;
export const PLAN_MARKER_BUBBLE_STROKE_PX = 1.5;
export const PLAN_MARKER_LABEL_PX = 11;
export const PLAN_MARKER_ARROW_LEN_PX = 10;
export const PLAN_MARKER_LINE_SW_PX = 1.25;
export const PLAN_MARKER_END_SEG_LEN_PX = 20;
export const PLAN_MARKER_END_SEG_SW_PX = 3;
export const PLAN_MARKER_GOLD_UNDERLAY_PX = 2;
export const PLAN_MARKER_BUBBLE_OUTSET_PX = 5;
export const PLAN_MARKER_DASH_CSS = "12 4 2 4";

export function planMetresPerCssPx(viewWidthM: number, svgClientWidthPx: number): number {
  return viewWidthM / Math.max(svgClientWidthPx, 1);
}

export function planMarkerCssToM(metresPerCssPx: number, px: number): number {
  return px * metresPerCssPx;
}

export function planMarkerBubbleRadiusM(metresPerCssPx: number, diameterPx = PLAN_MARKER_BUBBLE_DIAM_PX): number {
  return planMarkerCssToM(metresPerCssPx, diameterPx * 0.5);
}

export function knifeMarkerLetter(label: string): string {
  const match = label.match(/\b([A-Z])\s*$/);
  return match?.[1] ?? "A";
}

export function viewArrowTriangleEn(
  bubbleEast: number,
  bubbleNorth: number,
  viewEast: number,
  viewNorth: number,
  bubbleRadiusM: number,
  metresPerCssPx: number,
): string {
  const vlen = Math.hypot(viewEast, viewNorth) || 1;
  const ve = viewEast / vlen;
  const vn = viewNorth / vlen;
  const arrowLen = planMarkerCssToM(metresPerCssPx, PLAN_MARKER_ARROW_LEN_PX);
  const wing = planMarkerCssToM(metresPerCssPx, PLAN_MARKER_ARROW_LEN_PX * 0.52);
  const baseInset = bubbleRadiusM * 0.15;
  const baseX = bubbleEast + ve * (bubbleRadiusM + baseInset);
  const baseY = bubbleNorth + vn * (bubbleRadiusM + baseInset);
  const tipX = baseX + ve * arrowLen;
  const tipY = baseY + vn * arrowLen;
  const px = -vn;
  const py = ve;
  const lx = baseX - ve * wing * 0.35 + px * wing * 0.5;
  const ly = baseY - vn * wing * 0.35 + py * wing * 0.5;
  const rx = baseX - ve * wing * 0.35 - px * wing * 0.5;
  const ry = baseY - vn * wing * 0.35 - py * wing * 0.5;
  return `${lx},${-ly} ${tipX},${-tipY} ${rx},${-ry}`;
}

export function planMarkerPalette(selected: boolean): {
  ink: string;
  bubbleFill: string;
  gold: string;
  showGoldUnderlay: boolean;
} {
  return {
    ink: getColour("--section-knife-plan-marker-ink"),
    bubbleFill: getColour("--hatch-paper"),
    gold: getColour("--section-knife-marker-gold"),
    showGoldUnderlay: selected,
  };
}

export type SectionPlanMarkerEnds = {
  clip: SectionPlanMarkerClip;
  bubble0East: number;
  bubble0North: number;
  bubble1East: number;
  bubble1North: number;
};

export function sectionPlanMarkerEnds(
  geom: SectionPlanMarkerGeometry,
  clip: SectionPlanMarkerClip,
  metresPerCssPx: number,
): SectionPlanMarkerEnds {
  const radiusM = planMarkerBubbleRadiusM(metresPerCssPx);
  const outsetM = planMarkerCssToM(metresPerCssPx, PLAN_MARKER_BUBBLE_OUTSET_PX);
  const shift = radiusM + outsetM;
  return {
    clip,
    bubble0East: clip.east0 - geom.tangentEast * shift,
    bubble0North: clip.north0 - geom.tangentNorth * shift,
    bubble1East: clip.east1 + geom.tangentEast * shift,
    bubble1North: clip.north1 + geom.tangentNorth * shift,
  };
}
