import type { SiteWindSelection } from "../../lib/windRoseData";

export function windRoseCardOn({
  leftOpen,
  tab,
  analysisKind,
  siteWind,
}: {
  leftOpen: string | null;
  tab: string;
  analysisKind: string;
  siteWind: SiteWindSelection | null;
}): boolean {
  return leftOpen === "analysis" && tab !== "satellite" && analysisKind === "wind" && siteWind != null;
}
