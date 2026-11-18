import type { WindPeriodStats } from "./windRose";
import { sectorCenterDeg, sectorLabel, WIND_SECTOR_COUNT } from "./windRose";
import { stackedSectorArmLength } from "./windRoseStats";
import { windBandFill } from "./windBins";

export const WIND_ROSE_HUB_RADIUS_PX = 12;
export const WIND_ROSE_PETAL_SCALE = 0.92;
export const WIND_ROSE_FREQUENCY_GUIDES = [0.33, 0.66] as const;

export type WindRoseChartLayout = {
  cx: number;
  cy: number;
  outerR: number;
  petalMaxR: number;
  hubR: number;
  labelR: number;
};

export const DEFAULT_WIND_ROSE_LAYOUT: WindRoseChartLayout = {
  cx: 120,
  cy: 128,
  outerR: 88,
  petalMaxR: 88 * WIND_ROSE_PETAL_SCALE,
  hubR: WIND_ROSE_HUB_RADIUS_PX,
  labelR: 88 + 12,
};

export type WindRoseChartWedge = { d: string; fill: string; sector: number };

export function annularSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  centreDeg: number,
): string {
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

function windRoseArms(stats: WindPeriodStats): number[] {
  return Array.from({ length: WIND_SECTOR_COUNT }, (_, s) => stackedSectorArmLength(stats, s));
}

export function windRosePetalOuterRadii(
  stats: WindPeriodStats,
  layout: WindRoseChartLayout = DEFAULT_WIND_ROSE_LAYOUT,
): number[] {
  const arms = windRoseArms(stats);
  const maxArm = Math.max(...arms, 0.001);
  return arms.map((arm) => (arm > 0 ? layout.hubR + (arm / maxArm) * (layout.petalMaxR - layout.hubR) : 0));
}

export function windRoseSectorPoint(layout: WindRoseChartLayout, sector: number, r: number): { x: number; y: number } {
  const rad = ((sectorCenterDeg(sector) - 90) * Math.PI) / 180;
  return { x: layout.cx + Math.cos(rad) * r, y: layout.cy + Math.sin(rad) * r };
}

export function windRoseSectorSharePct(stats: WindPeriodStats, sector: number): number {
  return stackedSectorArmLength(stats, sector) * 100;
}

export function windRoseSectorTip(sector: number, sharePct: number, referenceMs: number | null): string {
  const speed = referenceMs != null ? `${referenceMs.toFixed(1)} m/s median` : "no wind";
  return `${sectorLabel(sector)} · ${Math.round(sharePct)}% of hours · ${speed}`;
}

export function windRoseStackedWedges(
  stats: WindPeriodStats,
  layout: WindRoseChartLayout = DEFAULT_WIND_ROSE_LAYOUT,
): WindRoseChartWedge[] {
  const arms = windRoseArms(stats);
  const maxArm = Math.max(...arms, 0.001);
  const { cx, cy, hubR, petalMaxR } = layout;
  const wedges: WindRoseChartWedge[] = [];
  for (let sector = 0; sector < WIND_SECTOR_COUNT; sector++) {
    const bins = stats.sectorSpeedBins?.[sector];
    const total = arms[sector] ?? 0;
    if (!bins?.length || total <= 0) continue;
    const sectorOuter = hubR + (total / maxArm) * (petalMaxR - hubR);
    let rInner = hubR;
    for (let band = 0; band < bins.length; band++) {
      const frac = bins[band] ?? 0;
      if (frac <= 0) continue;
      const rOuter = rInner + (frac / total) * (sectorOuter - hubR);
      wedges.push({
        d: annularSectorPath(cx, cy, rInner, rOuter, sectorCenterDeg(sector)),
        fill: windBandFill(band),
        sector,
      });
      rInner = rOuter;
    }
  }
  return wedges;
}

export function windRoseCardinalPositions(layout: WindRoseChartLayout = DEFAULT_WIND_ROSE_LAYOUT) {
  const { cx, cy, labelR } = layout;
  return {
    n: { x: cx, y: cy - labelR },
    e: { x: cx + labelR, y: cy },
    s: { x: cx, y: cy + labelR },
    w: { x: cx - labelR, y: cy },
  };
}

export function windRoseGuideLabelPositions(layout: WindRoseChartLayout = DEFAULT_WIND_ROSE_LAYOUT) {
  const { cx, cy, petalMaxR } = layout;
  const rad = ((45 - 90) * Math.PI) / 180;
  return WIND_ROSE_FREQUENCY_GUIDES.map((frac) => ({
    pct: Math.round(frac * 100),
    x: cx + Math.cos(rad) * petalMaxR * frac,
    y: cy + Math.sin(rad) * petalMaxR * frac,
  }));
}