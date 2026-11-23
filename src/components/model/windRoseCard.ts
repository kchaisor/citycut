import { windFlowActive } from "../../lib/solarStudyView";
import type { ActiveAnalyses } from "../../lib/sidebarSections";
import type { WindPeriodId } from "../../lib/windRose";

export const WIND_SEASON_IDS: readonly WindPeriodId[] = ["annual", "summer", "autumn", "winter", "spring"];

export function windStreaksSliderOn({
  tab,
  analyses,
  windEnabled,
  planActive,
}: {
  tab: string;
  analyses: ActiveAnalyses;
  windEnabled: boolean;
  planActive: boolean;
}): boolean {
  return tab === "3d" && windFlowActive(windEnabled, analyses) && !planActive;
}

export function siteIntelAutoFolded(analysisCardOn: boolean): boolean {
  return analysisCardOn;
}

export function windRoseCardMeta(
  periodLabel: string,
  years: number | null | undefined,
  daypartLabel?: string | null,
): string {
  const title = daypartLabel && daypartLabel !== "All day" ? `${periodLabel} · ${daypartLabel}` : periodLabel;
  return years != null ? `${title} · ${years} yrs` : title;
}

export type WindPrevailingStats = {
  prevailingLabel: string;
  prevailingMedianKmh: number;
  prevailingMeanSpeedMs?: number | null;
  calmPercent: number;
};

export function windPrevailingBadge(
  stats: WindPrevailingStats | null,
  planWind: boolean,
): { prevailing: string; calm: string | null } {
  if (!stats) return { prevailing: "—", calm: null };
  const speed = planWind
    ? `${(stats.prevailingMeanSpeedMs ?? stats.prevailingMedianKmh / 3.6).toFixed(1)} m/s`
    : `${Math.round(stats.prevailingMedianKmh)} km/h`;
  return { prevailing: `${stats.prevailingLabel} · ${speed}`, calm: `Calm ${stats.calmPercent.toFixed(1)}%` };
}
