import type { PdfChunk } from "./aiDocument";
import { hexRgb } from "./lineweights";
import { getColour } from "./colours";
import type { SheetLayout } from "./figureGround";
import { windFlowArrowPolylines } from "./windArrowGeometry";
import { analyzeWindPeriod, sectorCenterDeg, type WindPeriodId, type WindRoseTable } from "./windRose";

/** Rose placement: lower-right of site frame on sheet (mm). */
export function windRoseSheetLayout(layout: SheetLayout): { cx: number; cy: number; radiusMm: number } {
  const radiusMm = Math.min(layout.frameMm * 0.11, 28);
  const cx = layout.frameX + layout.frameMm - radiusMm - 4;
  const cy = layout.frameY + radiusMm + 6;
  return { cx, cy, radiusMm };
}

function sheetPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

/** Wedge rose, prevailing-direction arrows, and frame-scale flow arrows on the site-plan sheet. */
export function windPlanPdfChunk(
  table: WindRoseTable,
  period: WindPeriodId,
  layout: SheetLayout,
  sideM: number,
): PdfChunk {
  const fill = hexRgb(getColour("--wind-rose"));
  const { cx, cy, radiusMm } = windRoseSheetLayout(layout);
  const page = layout.pageHeightMm;
  const stats = analyzeWindPeriod(table, period);
  const maxFreq = Math.max(...stats.sectorFrequency, 0.001);
  const paths: PdfChunk["paths"] = [];

  for (let sector = 0; sector < stats.sectorFrequency.length; sector++) {
    const freq = stats.sectorFrequency[sector] ?? 0;
    if (freq <= 0) continue;
    const r = (freq / maxFreq) * radiusMm;
    const centre = sectorCenterDeg(sector);
    const half = 22.5 / 2;
    const steps = 6;
    const ring: number[][] = [[cx, page - cy]];
    for (let i = 0; i <= steps; i++) {
      const deg = centre - half + (i * (2 * half)) / steps;
      const rad = ((deg - 90) * Math.PI) / 180;
      ring.push([cx + Math.cos(rad) * r, page - (cy + Math.sin(rad) * r)]);
    }
    paths.push({
      rings: [ring],
      fill,
      close: true,
      evenOdd: false,
    });
  }

  const fromDeg = sectorCenterDeg(stats.prevailingSector);
  const rad = ((fromDeg + 180 - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * radiusMm * 0.15;
    const px = cx + offset * -dy;
    const py = cy + offset * dx;
    const len = radiusMm * (0.35 + i * 0.08);
    paths.push({
      rings: [
        [
          [px - dx * len * 0.35, page - (py - dy * len * 0.35)],
          [px + dx * len, page - (py + dy * len)],
        ],
      ],
      close: false,
      stroke: fill,
      strokeMm: 0.18,
      cap: "round",
    });
  }

  const flowInk = hexRgb(getColour("--wind-streak"));
  for (const arrow of windFlowArrowPolylines(sideM, stats.prevailingSector)) {
    const path = arrow.path.map(([east, north]) => sheetPoint(east, north, sideM, layout));
    paths.push({
      rings: [path],
      close: false,
      stroke: flowInk,
      strokeMm: 0.35,
      cap: "round",
      join: "round",
    });
    const head = arrow.head.map(([east, north]) => sheetPoint(east, north, sideM, layout));
    paths.push({
      rings: [[head[0]!, head[1]!, head[2]!]],
      close: true,
      fill: flowInk,
    });
  }

  return { name: "Wind", paths };
}
