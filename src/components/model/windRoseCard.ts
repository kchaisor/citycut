import type { SiteWindSelection } from "../../lib/windRoseData";
import type { WindViewSettings } from "../../lib/windState";

export function windRoseChipOn(settings: Pick<WindViewSettings, "enabled" | "showRose">): boolean {
  return settings.enabled && settings.showRose;
}

export function toggleWindRoseChip(settings: WindViewSettings): WindViewSettings {
  return windRoseChipOn(settings) ? { ...settings, showRose: false } : { ...settings, enabled: true, showRose: true };
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
  windSettings: Pick<WindViewSettings, "enabled" | "showRose">;
  planActive: boolean;
}): boolean {
  if (leftOpen !== "analysis" || tab === "satellite" || analysisKind !== "wind" || siteWind == null) return false;
  return planActive || windRoseChipOn(windSettings);
}
