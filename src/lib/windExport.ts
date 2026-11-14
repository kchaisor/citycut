import type { PdfChunk, PdfText } from "./aiDocument";
import { hexRgb } from "./lineweights";
import { getColour } from "./colours";
import type { SheetLayout } from "./figureGround";
import { windFlowArrowPolylines } from "./windArrowGeometry";
import { sectorCenterDeg, type WindPeriodId, type WindPeriodStats } from "./windRose";
import type { SiteWindSelection } from "./windRoseData";
import { analyzeSiteWind, stackedSectorArmLength } from "./windRoseStats";
import { windRoseStationCaption } from "./windRoseSvg";

const BAND_VARS = ["--wind-band-0", "--wind-band-1", "--wind-band-2", "--wind-band-3", "--wind-band-4"] as const;

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

function annularSectorRing(
  cx: number,
  cy: number,
  page: number,
  rInner: number,
  rOuter: number,
  centreDeg: number,
  steps = 6,
): number[][] {
  const half = 22.5 / 2;
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const rad = ((centreDeg - half + (i * (2 * half)) / steps - 90) * Math.PI) / 180;
    ring.push([cx + Math.cos(rad) * rOuter, page - (cy + Math.sin(rad) * rOuter)]);
  }
  for (let i = steps; i >= 0; i--) {
    const rad = ((centreDeg - half + (i * (2 * half)) / steps - 90) * Math.PI) / 180;
    ring.push([cx + Math.cos(rad) * rInner, page - (cy + Math.sin(rad) * rInner)]);
  }
  return ring;
}

export function windPlanPdfChunkFromStats(
  stats: WindPeriodStats,
  layout: SheetLayout,
  sideM: number,
): PdfChunk {
  const { cx, cy, radiusMm } = windRoseSheetLayout(layout);
  const page = layout.pageHeightMm;
  const paths: PdfChunk["paths"] = [];
  const arms = stats.sectorSpeedBins?.map((_, s) => stackedSectorArmLength(stats, s)) ?? stats.sectorFrequency;
  const maxArm = Math.max(...arms, 0.001);
  const hub = radiusMm * 0.06;

  for (let sector = 0; sector < arms.length; sector++) {
    const total = arms[sector] ?? 0;
    const bins = stats.sectorSpeedBins?.[sector];
    if (!bins?.length || total <= 0) continue;
    const sectorOuter = hub + (total / maxArm) * (radiusMm - hub);
    let rInner = hub;
    const centre = sectorCenterDeg(sector);
    for (let band = 0; band < bins.length; band++) {
      const frac = bins[band] ?? 0;
      if (frac <= 0) continue;
      const rOuter = rInner + (frac / total) * (sectorOuter - hub);
      const fill = hexRgb(getColour(BAND_VARS[band] ?? BAND_VARS[4]));
      paths.push({
        rings: [annularSectorRing(cx, cy, page, rInner, rOuter, centre)],
        fill,
        close: true,
        evenOdd: false,
      });
      rInner = rOuter;
    }
  }

  const fromDeg = sectorCenterDeg(stats.prevailingSector);
  const rad = ((fromDeg + 180 - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const stroke = hexRgb(getColour("--wind-rose"));
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
      stroke,
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

export function windPlanPdfChunk(
  selection: SiteWindSelection,
  period: WindPeriodId,
  layout: SheetLayout,
  sideM: number,
): PdfChunk {
  const stats = analyzeSiteWind(selection, period);
  if (!stats) return { name: "Wind", paths: [] };
  const chunk = windPlanPdfChunkFromStats(stats, layout, sideM);
  const { cy, radiusMm } = windRoseSheetLayout(layout);
  const page = layout.pageHeightMm;
  const caption = windRoseStationCaption(selection, period);
  const ink = hexRgb(getColour("--wind-rose"));
  const texts: PdfText[] = [
    { x: layout.frameX + 4, y: page - (cy + radiusMm + 5), sizeMm: 2.2, text: caption, color: ink },
    {
      x: layout.frameX + 4,
      y: page - (cy + radiusMm + 9),
      sizeMm: 2,
      text: "Regional station wind, not site wind.",
      color: ink,
    },
  ];
  return { ...chunk, texts };
}