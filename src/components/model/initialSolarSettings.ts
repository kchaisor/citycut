import { capturePresetFromSearch } from "../../lib/captureQuery";
import { readStoredHeliodonRadiusFactor, resolveHeliodonRadiusFactor } from "../../lib/heliodonRadius";
import { NO_ANALYSES, analysesOf, type ActiveAnalyses } from "../../lib/sidebarSections";
import { DEFAULT_SUN_HOURS_WINDOW } from "../../lib/sunHoursWindow";
import type { SolarViewSettings } from "../SolarHeliodon";

export function initialSolarSettings(
  search: string,
  storage: Parameters<typeof readStoredHeliodonRadiusFactor>[0],
): SolarViewSettings {
  return {
    showPath: capturePresetFromSearch(search).solarPath,
    castShadows: false,
    radiusFactor: resolveHeliodonRadiusFactor(readStoredHeliodonRadiusFactor(storage), search),
    year: 2026,
    month: 9,
    day: 22,
    hour: 15,
    minute: 0,
    sunHours: false,
    sunHoursWindow: DEFAULT_SUN_HOURS_WINDOW,
    sunHoursPickedOnly: false,
  };
}

export function initialAnalyses(search: string): ActiveAnalyses {
  return capturePresetFromSearch(search).solarPath ? analysesOf("solar") : NO_ANALYSES;
}
