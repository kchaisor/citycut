import type { PdfChunk, PdfEllipse, PdfPath, PdfText } from "../aiDocument";
import type { SheetLayout } from "../figureGround";
import { getColour } from "../colours";
import { hexRgb } from "../lineweights";
import type { CityModel } from "../../types";
import { knifeMarkerLetter } from "./planMarkerDraw";
import { sectionPlanMarkerGeometry } from "./marker";
import type { SectionKnifeToolState } from "./state";

const BUBBLE_RADIUS_MM = 2;
const ARROW_LEN_MM = 2.4;
const END_TICK_HALF_MM = 1.85;

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

function arrowRing(cx: number, cy: number, vx: number, vy: number, len = ARROW_LEN_MM): number[][] {
  const tipX = cx + vx * len;
  const tipY = cy + vy * len;
  const wing = len * 0.55;
  const px = -vy;
  const py = vx;
  const lx = cx - vx * wing * 0.35 + px * wing * 0.5;
  const ly = cy - vy * wing * 0.35 + py * wing * 0.5;
  const rx = cx - vx * wing * 0.35 - px * wing * 0.5;
  const ry = cy - vy * wing * 0.35 - py * wing * 0.5;
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
  const gold = hexRgb(getColour("--section-knife-marker-gold"));
  const dark = hexRgb(getColour("--outline-building"));
  const sheetFill = hexRgb(getColour("--sheet-fill"));
  const paths: PdfPath[] = [];
  const ellipses: PdfEllipse[] = [];
  const texts: PdfText[] = [];
  for (const knife of tool.knives) {
    const geom = sectionPlanMarkerGeometry(model, knife.pose);
    const p0 = mapPoint(geom.east0, geom.north0, model.sideM, layout);
    const p1 = mapPoint(geom.east1, geom.north1, model.sideM, layout);
    const selected = knife.id === tool.selectedId;
    const stroke = selected ? gold : dark;
    const strokeMm = selected ? 0.48 : 0.42;
    paths.push({
      rings: [[p0, p1]],
      close: false,
      stroke,
      strokeMm,
      dashMm: [4.8, 1.05],
      cap: "butt",
      join: "miter",
      opacity: selected ? 1 : 0.92,
    });
    const [tx, ty] = unitTangent(p0, p1);
    const perpX = -ty;
    const perpY = tx;
    for (const [cx, cy] of [p0, p1]) {
      paths.push({
        rings: [
          [
            [cx - perpX * END_TICK_HALF_MM, cy - perpY * END_TICK_HALF_MM],
            [cx + perpX * END_TICK_HALF_MM, cy + perpY * END_TICK_HALF_MM],
          ],
        ],
        close: false,
        stroke,
        strokeMm: strokeMm * 1.7,
        cap: "butt",
        join: "miter",
        opacity: selected ? 1 : 0.92,
      });
    }
    const viewLen = Math.hypot(geom.viewEast, geom.viewNorth) || 1;
    const vx = geom.viewEast / viewLen;
    const vy = geom.viewNorth / viewLen;
    for (const [cx, cy] of [p0, p1]) {
      paths.push({
        rings: [arrowRing(cx, cy, vx, vy)],
        close: true,
        fill: stroke,
        stroke,
        strokeMm: strokeMm * 0.35,
        join: "miter",
      });
    }
  }
  for (const knife of tool.knives) {
    const geom = sectionPlanMarkerGeometry(model, knife.pose);
    const p0 = mapPoint(geom.east0, geom.north0, model.sideM, layout);
    const p1 = mapPoint(geom.east1, geom.north1, model.sideM, layout);
    const selected = knife.id === tool.selectedId;
    const stroke = selected ? gold : dark;
    const letter = knifeMarkerLetter(knife.label);
    for (const [cx, cy] of [p0, p1]) {
      ellipses.push({
        kind: "ellipse",
        cx,
        cy,
        rx: BUBBLE_RADIUS_MM,
        ry: BUBBLE_RADIUS_MM,
        fill: sheetFill,
        stroke,
        strokeMm: selected ? 0.38 : 0.34,
      });
    }
    const labelSize = 2.85;
    texts.push({
      x: p0[0],
      y: p0[1] + labelSize * 0.12,
      sizeMm: labelSize,
      text: letter,
      color: stroke,
    });
    texts.push({
      x: p1[0],
      y: p1[1] + labelSize * 0.12,
      sizeMm: labelSize,
      text: `${letter}′`,
      color: stroke,
    });
  }
  if (paths.length === 0) return null;
  return { name: "Section markers", paths, ellipses, texts };
}
