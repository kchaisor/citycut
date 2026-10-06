import { getColour } from "./colours";
import {
  SECTOR_LABELS,
  WIND_SECTOR_COUNT,
  analyzeWindPeriod,
  sectorCenterDeg,
  type WindPeriodId,
  type WindRoseTable,
} from "./windRose";

export type WindRoseSvgOptions = {
  sizePx: number;
  caption?: string;
};

/** Wedge paths for one rose (sector polygons in 0–1 unit space, centre at 0.5,0.5). */
export function windRoseWedgePaths(
  table: WindRoseTable,
  period: WindPeriodId,
): { d: string; opacity: number }[] {
  const stats = analyzeWindPeriod(table, period);
  const maxFreq = Math.max(...stats.sectorFrequency, 0.001);
  const cx = 0.5;
  const cy = 0.5;
  const outer = 0.46;
  const paths: { d: string; opacity: number }[] = [];
  for (let sector = 0; sector < WIND_SECTOR_COUNT; sector++) {
    const freq = stats.sectorFrequency[sector] ?? 0;
    if (freq <= 0) continue;
    const r = (freq / maxFreq) * outer;
    const centre = sectorCenterDeg(sector);
    const half = 22.5 / 2;
    const start = ((centre - half - 90) * Math.PI) / 180;
    const end = ((centre + half - 90) * Math.PI) / 180;
    const x0 = cx + Math.cos(start) * 0.02;
    const y0 = cy + Math.sin(start) * 0.02;
    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const x3 = cx + Math.cos(end) * 0.02;
    const y3 = cy + Math.sin(end) * 0.02;
    paths.push({
      d: `M ${x0} ${y0} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} L ${x3} ${y3} Z`,
      opacity: 0.35 + (freq / maxFreq) * 0.55,
    });
  }
  return paths;
}

export function windRoseCaption(table: WindRoseTable, period: WindPeriodId): string {
  const stats = analyzeWindPeriod(table, period);
  return `Mostly ${stats.prevailingLabel} · 2016–25 · regional wind (Open-Meteo)`;
}

export function windRoseArrowLines(
  table: WindRoseTable,
  period: WindPeriodId,
  count = 3,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const stats = analyzeWindPeriod(table, period);
  const fromDeg = sectorCenterDeg(stats.prevailingSector);
  const rad = ((fromDeg + 180 - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = 0.5;
  const cy = 0.5;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 0.08;
    const px = cx + offset * -dy;
    const py = cy + offset * dx;
    const len = 0.22 + i * 0.04;
    lines.push({
      x1: px - dx * len * 0.4,
      y1: py - dy * len * 0.4,
      x2: px + dx * len,
      y2: py + dy * len,
    });
  }
  return lines;
}

export function renderWindRoseSvgMarkup(
  table: WindRoseTable,
  period: WindPeriodId,
  options: WindRoseSvgOptions,
): string {
  const fill = getColour("--wind-rose");
  const wedges = windRoseWedgePaths(table, period);
  const arrows = windRoseArrowLines(table, period);
  const caption = options.caption ?? windRoseCaption(table, period);
  const size = options.sizePx;
  const wedgePaths = wedges
    .map((w) => `<path d="${w.d}" fill="${fill}" fill-opacity="${w.opacity.toFixed(2)}" />`)
    .join("");
  const arrowPaths = arrows
    .map(
      (a) =>
        `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${fill}" stroke-width="0.02" stroke-linecap="round" marker-end="url(#wind-arrow)" />`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="${size}" height="${size}" role="img" aria-label="${caption}">
  <defs>
    <marker id="wind-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
      <path d="M0,0 L4,2 L0,4 z" fill="${fill}" />
    </marker>
  </defs>
  <circle cx="0.5" cy="0.5" r="0.48" fill="none" stroke="${fill}" stroke-width="0.012" opacity="0.5"/>
  ${wedgePaths}
  ${arrowPaths}
  <text x="0.5" y="0.96" text-anchor="middle" font-size="0.07" fill="${fill}" font-family="Helvetica, Arial, sans-serif">${SECTOR_LABELS[analyzeWindPeriod(table, period).prevailingSector]}</text>
</svg>`;
}
