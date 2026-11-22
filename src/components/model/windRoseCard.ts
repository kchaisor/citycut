import { windFlowActive } from "../../lib/solarStudyView";
import type { ActiveAnalysis } from "../../lib/sidebarSections";
import type { SiteWindSelection } from "../../lib/windRoseData";

export function windRoseCardOn({
  tab,
  analysisKind,
  siteWind,
}: {
  tab: string;
  analysisKind: ActiveAnalysis;
  siteWind: SiteWindSelection | null;
}): boolean {
  return tab !== "satellite" && analysisKind === "wind" && siteWind != null;
}

export function windStreaksSliderOn({
  tab,
  analysisKind,
  windEnabled,
  planActive,
}: {
  tab: string;
  analysisKind: ActiveAnalysis;
  windEnabled: boolean;
  planActive: boolean;
}): boolean {
  return tab === "3d" && windFlowActive(windEnabled, analysisKind) && !planActive;
}

export const WIND_ROSE_CARD_ROOMY_WIDTH_PX = 1440;

export function windRoseCardAutoCollapsed(rightOpen: string, viewportWidth: number): boolean {
  return (rightOpen === "buildings" || rightOpen === "trees") && viewportWidth < WIND_ROSE_CARD_ROOMY_WIDTH_PX;
}

export function windRoseCardMeta(periodLabel: string, years: number | null | undefined): string {
  return years != null ? `${periodLabel} · ${years} yrs` : periodLabel;
}
