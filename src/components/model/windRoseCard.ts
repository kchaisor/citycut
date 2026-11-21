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
