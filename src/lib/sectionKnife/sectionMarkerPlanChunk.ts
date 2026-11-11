import type { PdfChunk, PdfEllipse, PdfPath, PdfText } from "../aiDocument";
import type { SheetLayout } from "../figureGround";
import { getColour } from "../colours";
import { hexRgb } from "../lineweights";
import type { CityModel } from "../../types";
import { knifeMarkerLetter } from "./planMarkerDraw";
import { sectionPlanMarkerClip, sectionPlanMarkerGeometry } from "./marker";
import type { SectionKnifeToolState } from "./state";

const BUBBLE_RADIUS_MM = 2.15;
const BUBBLE_STROKE_MM = 0.4;
const BUBBLE_OUTSET_MM = 1.35;
const ARROW_LEN_MM = 2.65;
const END_SEG_HALF_MM = 3.2;
const LINE_STROKE_MM = 0.35;
const END_SEG_STROKE_MM = 0.8;
const GOLD_UNDERLAY_MM = 0.55;
const LABEL_MM = 2.9;

function mapPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

function unitTangent(p0: [number, number], p1: [number, number]): [number, number] {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

function arrowRing(cx: number, cy: number, vx: number, vy: number): number[][] {
  const vlen = Math.hypot(vx, vy) || 1;
  const ve = vx / vlen;
  const vn = vy / vlen;
  const len = ARROW_LEN_MM;
  const wing = len * 0.52;
  const baseX = cx + ve * (BUBBLE_RADIUS_MM + 0.35);
  const baseY = cy + vn * (BUBBLE_RADIUS_MM + 0.35);
  const tipX = baseX + ve * len;
  const tipY = baseY + vn * len;
  const px = -vn;
  const py = ve;
  const lx = baseX - ve * wing * 0.35 + px * wing * 0.5;
  const ly = baseY - vn * wing * 0.35 + py * wing * 0.5;
  const rx = baseX - ve * wing * 0.35 - px * wing * 0.5;
  const ry = baseY - vn * wing * 0.35 - py * wing * 0.5;
  return [
    [lx, ly],
    [tipX, tipY],
    [rx, ry],
  ];
}

export function sectionMarkerPlanChunk(
  model: CityModel,
  layout: SheetLayout,
  tool: SectionKnifeToolState | null | undefined,
): PdfChunk | null {
  if (!tool?.active || tool.knives.length === 0) return null;
  const ink = hexRgb(getColour("--section-knife-plan-marker-ink"));
  const gold = hexRgb(getColour("--section-knife-marker-gold"));
  const sheetFill = hexRgb(getColour("--hatch-paper"));
  const paths: PdfPath[] = [];
  const ellipses: PdfEllipse[] = [];
  const texts: PdfText[] = [];
  for (const knife of tool.knives) {
    const geom = sectionPlanMarkerGeometry(model, knife.pose);
    const clip = sectionPlanMarkerClip(model, geom);
    const p0 = mapPoint(clip.east0, clip.north0, model.sideM, layout);
    const p1 = mapPoint(clip.east1, clip.north1, model.sideM, layout);
    const selected = knife.id === tool.selectedId;
    const [tx, ty] = unitTangent(p0, p1);
    const viewLen = Math.hypot(geom.viewEast, geom.viewNorth) || 1;
    const vxMm = (geom.viewEast / viewLen) * layout.frameMm;
    const vyMm = (geom.viewNorth / viewLen) * layout.frameMm;
    const bubbleShift = BUBBLE_RADIUS_MM + BUBBLE_OUTSET_MM;
    const b0: [number, number] = [p0[0] - tx * bubbleShift, p0[1] - ty * bubbleShift];
    const b1: [number, number] = [p1[0] + tx * bubbleShift, p1[1] + ty * bubbleShift];
    if (selected) {
      paths.push({
        rings: [[p0, p1]],
        close: false,
        stroke: gold,
        strokeMm: GOLD_UNDERLAY_MM,
        cap: "butt",
        join: "miter",
      });
    }
    paths.push({
      rings: [[p0, p1]],
      close: false,
      stroke: ink,
      strokeMm: LINE_STROKE_MM,
      dashMm: [3.2, 1.05, 0.55, 1.05],
      cap: "butt",
      join: "miter",
    });
    for (const [cx, cy] of [p0, p1]) {
      paths.push({
        rings: [
          [
            [cx - tx * END_SEG_HALF_MM, cy - ty * END_SEG_HALF_MM],
            [cx + tx * END_SEG_HALF_MM, cy + ty * END_SEG_HALF_MM],
          ],
        ],
        close: false,
        stroke: ink,
        strokeMm: END_SEG_STROKE_MM,
        cap: "butt",
        join: "miter",
      });
    }
    for (const [cx, cy] of [b0, b1]) {
      paths.push({
        rings: [arrowRing(cx, cy, vxMm, vyMm)],
        close: true,
        fill: ink,
        stroke: ink,
        strokeMm: 0.12,
        join: "miter",
      });
    }
    for (const [cx, cy] of [b0, b1]) {
      ellipses.push({
        kind: "ellipse",
        cx,
        cy,
        rx: BUBBLE_RADIUS_MM,
        ry: BUBBLE_RADIUS_MM,
        fill: sheetFill,
        stroke: ink,
        strokeMm: BUBBLE_STROKE_MM,
      });
    }
    const letter = knifeMarkerLetter(knife.label);
    texts.push({
      x: b0[0],
      y: b0[1] + LABEL_MM * 0.08,
      sizeMm: LABEL_MM,
      text: letter,
      color: ink,
    });
    texts.push({
      x: b1[0],
      y: b1[1] + LABEL_MM * 0.08,
      sizeMm: LABEL_MM,
      text: `${letter}′`,
      color: ink,
    });
  }
  if (paths.length === 0) return null;
  return { name: "Section markers", paths, ellipses, texts };
}
