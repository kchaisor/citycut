import type { SiteWindSelection } from "../../lib/windRoseData";
import type { WindViewSettings } from "../../lib/windState";

export function windRoseChipOn(settings: Pick<WindViewSettings, "showRose">): boolean {
  return settings.showRose;
}

export function toggleWindRoseChip(settings: WindViewSettings): WindViewSettings {
  return settings.showRose ? { ...settings, showRose: false } : { ...settings, enabled: true, showRose: true };
}

export function windRoseCardOn({
  leftOpen,
  tab,
  analysisKind,
  siteWind,
  windSettings,
  planActive,
}: {
  leftOpen: string | null;
  tab: string;
  analysisKind: string;
  siteWind: SiteWindSelection | null;
  windSettings: Pick<WindViewSettings, "showRose">;
  planActive: boolean;
}): boolean {
  if (leftOpen !== "analysis" || tab === "satellite" || analysisKind !== "wind" || siteWind == null) return false;
  if (planActive) return true;
  return windRoseChipOn(windSettings);
}
