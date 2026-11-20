import type { WindPeriodStats } from "./windRose";
import { sectorCenterDeg, sectorLabel, WIND_SECTOR_COUNT } from "./windRose";
import { stackedSectorArmLength } from "./windRoseStats";
import { windBandFill } from "./windBins";

export const WIND_ROSE_HUB_RADIUS_PX = 12;
export const WIND_ROSE_PETAL_SCALE = 0.92;
export const WIND_ROSE_FREQUENCY_GUIDES = [0.33, 0.66] as const;

export const WIND_ROSE_SELECTED_LABEL_GAP_PX = 14;
export const WIND_ROSE_TIP_GAP_PX = 8;
const WIND_ROSE_CARDINAL_CLEAR_PX = 10;

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

export function circularArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = ((startDeg - 90) * Math.PI) / 180;
  const end = ((endDeg - 90) * Math.PI) / 180;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx + Math.cos(start) * r} ${cy + Math.sin(start) * r} A ${r} ${r} 0 ${large} 1 ${cx + Math.cos(end) * r} ${cy + Math.sin(end) * r}`;
}

export function windRoseSelectedArcPaths(
  layout: WindRoseChartLayout,
  sector: number,
  edgePx: number,
): { mark: string; edge: string } {
  const centre = sectorCenterDeg(sector);
  const half = 360 / WIND_SECTOR_COUNT / 2;
  const edgeDeg = (edgePx / layout.outerR) * (180 / Math.PI);
  return {
    mark: circularArcPath(layout.cx, layout.cy, layout.outerR, centre - half, centre + half),
    edge: circularArcPath(layout.cx, layout.cy, layout.outerR, centre - half - edgeDeg, centre + half + edgeDeg),
  };
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

export function windRoseSectorTip(
  sector: number,
  sharePct: number,
  referenceMs: number | null,
  periodLabel: string | null = null,
): string {
  const speed = referenceMs != null ? `${referenceMs.toFixed(1)} m/s` : "no wind";
  const parts = [sectorLabel(sector), periodLabel, `${Math.round(sharePct)}% of hours`, speed];
  return parts.filter((part) => part != null).join(" · ");
}

export type WindRoseTipBox = { x: number; y: number; flipped: boolean };

export function windRoseTipBox(
  layout: WindRoseChartLayout,
  sector: number,
  width: number,
  height: number,
  fits: (box: WindRoseTipBox) => boolean = () => true,
): WindRoseTipBox {
  const { cx, cy } = layout;
  const at = windRoseSectorPoint(layout, sector, layout.outerR + WIND_ROSE_TIP_GAP_PX);
  const offX = Math.max(Math.abs(at.x - cx), WIND_ROSE_CARDINAL_CLEAR_PX);
  const offY = Math.max(Math.abs(at.y - cy), WIND_ROSE_CARDINAL_CLEAR_PX);
  const below = sector > WIND_SECTOR_COUNT / 4 && sector < (WIND_SECTOR_COUNT * 3) / 4;
  const y = below ? cy + offY : cy - offY - height;
  const right = { x: cx + offX, y, flipped: false };
  const left = { x: cx - offX - width, y, flipped: false };
  const [first, second] = sector <= WIND_SECTOR_COUNT / 2 ? [right, left] : [left, right];
  return fits(first) || !fits(second) ? first : { ...second, flipped: true };
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

export function windRoseQuietSector(stats: WindPeriodStats): number {
  const arms = windRoseArms(stats);
  const at = (s: number) => arms[(s + WIND_SECTOR_COUNT) % WIND_SECTOR_COUNT] ?? 0;
  let best = 0;
  for (let s = 1; s < WIND_SECTOR_COUNT; s++) {
    const quieter = at(s) < at(best) || (at(s) === at(best) && at(s - 1) + at(s + 1) < at(best - 1) + at(best + 1));
    if (quieter) best = s;
  }
  return best;
}

export function windRoseGuideLabelPositions(
  stats: WindPeriodStats,
  layout: WindRoseChartLayout = DEFAULT_WIND_ROSE_LAYOUT,
) {
  const sector = windRoseQuietSector(stats);
  return WIND_ROSE_FREQUENCY_GUIDES.map((frac) => ({
    pct: Math.round(frac * 100),
    sector,
    ...windRoseSectorPoint(layout, sector, layout.petalMaxR * frac),
  }));
}