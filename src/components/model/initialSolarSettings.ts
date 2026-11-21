import { capturePresetFromSearch } from "../../lib/captureQuery";
import { readStoredHeliodonRadiusFactor, resolveHeliodonRadiusFactor } from "../../lib/heliodonRadius";
import type { ActiveAnalysis } from "../../lib/sidebarSections";
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
  };
}

export function initialAnalysisKind(search: string): ActiveAnalysis {
  return capturePresetFromSearch(search).solarPath ? "solar" : null;
}
