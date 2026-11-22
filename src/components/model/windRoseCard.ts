import { windFlowActive } from "../../lib/solarStudyView";
import type { ActiveAnalyses } from "../../lib/sidebarSections";
import type { SiteWindSelection } from "../../lib/windRoseData";

export function windRoseCardOn({
  tab,
  analyses,
  siteWind,
}: {
  tab: string;
  analyses: ActiveAnalyses;
  siteWind: SiteWindSelection | null;
}): boolean {
  return tab !== "satellite" && analyses.wind && siteWind != null;
}

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

export function siteIntelAutoFolded(windRoseOn: boolean): boolean {
  return windRoseOn;
}

export const WIND_ROSE_CARD_ROOMY_WIDTH_PX = 1440;

export function windRoseCardAutoCollapsed(rightOpen: string, viewportWidth: number): boolean {
  return (rightOpen === "buildings" || rightOpen === "trees") && viewportWidth < WIND_ROSE_CARD_ROOMY_WIDTH_PX;
}

export function windRoseCardMeta(periodLabel: string, years: number | null | undefined): string {
  return years != null ? `${periodLabel} · ${years} yrs` : periodLabel;
}
