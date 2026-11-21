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
