import { getColour } from "./colours";
import {
  WIND_SECTOR_COUNT,
  analyzeWindPeriod,
  sectorCenterDeg,
  type WindPeriodId,
  type WindPeriodStats,
  type WindRoseTable,
} from "./windRose";
import type { SiteWindSelection } from "./windRoseData";
import { formatStationYears, plainWindCaption } from "./windRoseCaptions";
import { analyzeSiteWind, stackedSectorArmLength } from "./windRoseStats";

const BAND_VARS = ["--wind-band-0", "--wind-band-1", "--wind-band-2", "--wind-band-3", "--wind-band-4"] as const;

export type WindRoseSvgOptions = {
  sizePx: number;
  caption?: string;
};

export type WindRoseWedge = { d: string; fill: string; opacity: number };

function annularSectorPath(cx: number, cy: number, rInner: number, rOuter: number, centreDeg: number): string {
  const half = 22.5 / 2;
  const start = ((centreDeg - half - 90) * Math.PI) / 180;
  const end = ((centreDeg + half - 90) * Math.PI) / 180;
  const x1 = cx + Math.cos(start) * rInner;
  const y1 = cy + Math.sin(start) * rInner;
  const x2 = cx + Math.cos(start) * rOuter;
  const y2 = cy + Math.sin(start) * rOuter;
  const x3 = cx + Math.cos(end) * rOuter;
  const y3 = cy + Math.sin(end) * rOuter;
  const x4 = cx + Math.cos(end) * rInner;
  const y4 = cy + Math.sin(end) * rInner;
  return `M ${x1} ${y1} L ${x2} ${y2} A ${rOuter} ${rOuter} 0 0 1 ${x3} ${y3} L ${x4} ${y4} Z`;
}

export function windRoseStackedWedges(stats: WindPeriodStats, cx: number, cy: number, inner: number, outerMax: number): WindRoseWedge[] {
  const arms = Array.from({ length: WIND_SECTOR_COUNT }, (_, s) => stackedSectorArmLength(stats, s));
  const maxArm = Math.max(...arms, 0.001);
  const wedges: WindRoseWedge[] = [];
  for (let sector = 0; sector < WIND_SECTOR_COUNT; sector++) {
    const bins = stats.sectorSpeedBins?.[sector];
    const total = arms[sector] ?? 0;
    if (!bins?.length || total <= 0) continue;
    const sectorOuter = inner + (total / maxArm) * (outerMax - inner);
    let rInner = inner;
    for (let band = 0; band < bins.length; band++) {
      const frac = bins[band] ?? 0;
      if (frac <= 0) continue;
      const rOuter = rInner + (frac / total) * (sectorOuter - inner);
      wedges.push({
        d: annularSectorPath(cx, cy, rInner, rOuter, sectorCenterDeg(sector)),
        fill: getColour(BAND_VARS[band] ?? BAND_VARS[4]),
        opacity: 0.92,
      });
      rInner = rOuter;
    }
  }
  return wedges;
}

export function windRoseWedgePaths(table: WindRoseTable, period: WindPeriodId): { d: string; opacity: number }[] {
  const stats = analyzeWindPeriod(table, period);
  const wedges = windRoseStackedWedges(stats, 0.5, 0.5, 0.02, 0.46);
  return wedges.map((w) => ({ d: w.d, opacity: w.opacity }));
}

export function windRoseStationCaption(selection: SiteWindSelection, period: WindPeriodId): string {
  const stats = analyzeSiteWind(selection, period);
  const s = selection.station;
  const dist = s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km` : "—";
  const label = stats?.prevailingLabel ?? "—";
  return plainWindCaption(`${s.name} · ${dist} · ${formatStationYears(selection)} · ${label} · ${selection.asset.source}`);
}

export function windRoseCaption(table: WindRoseTable, period: WindPeriodId): string {
  const stats = analyzeWindPeriod(table, period);
  return `Mostly ${stats.prevailingLabel} · regional wind`;
}

export function windRoseArrowLines(
  stats: WindPeriodStats,
  count = 3,
  cx = 0.5,
  cy = 0.5,
  radiusScale = 0.46,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const fromDeg = sectorCenterDeg(stats.prevailingSector);
  const rad = ((fromDeg + 180 - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 0.08;
    const px = cx + offset * -dy;
    const py = cy + offset * dx;
    const len = radiusScale * (0.5 + i * 0.08);
    lines.push({
      x1: px - dx * len * 0.35,
      y1: py - dy * len * 0.35,
      x2: px + dx * len,
      y2: py + dy * len,
    });
  }
  return lines;
}

export function renderWindRoseSvgMarkupFromStats(
  stats: WindPeriodStats,
  options: WindRoseSvgOptions & { caption: string },
): string {
  const stroke = getColour("--wind-rose");
  const hub = getColour("--wind-rose-card-surface");
  const wedges = windRoseStackedWedges(stats, 0.5, 0.5, 0.06, 0.46 * 0.92);
  const size = options.sizePx;
  const wedgePaths = wedges.map((w) => `<path d="${w.d}" fill="${w.fill}" fill-opacity="${w.opacity.toFixed(2)}" />`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="${size}" height="${size}" role="img" aria-label="${options.caption}">
  <circle cx="0.5" cy="0.5" r="0.48" fill="none" stroke="${stroke}" stroke-width="0.012" opacity="0.5"/>
  ${wedgePaths}
  <circle cx="0.5" cy="0.5" r="0.05" fill="${hub}"/>
  <text x="0.5" y="0.96" text-anchor="middle" font-size="0.055" fill="${stroke}" font-family="Helvetica, Arial, sans-serif">${options.caption}</text>
</svg>`;
}

export function renderWindRoseSvgMarkup(
  table: WindRoseTable,
  period: WindPeriodId,
  options: WindRoseSvgOptions,
): string {
  const stats = analyzeWindPeriod(table, period);
  const caption = options.caption ?? windRoseCaption(table, period);
  return renderWindRoseSvgMarkupFromStats(stats, { ...options, caption });
}