import { capturePresetFromSearch } from "../../lib/captureQuery";
import { readStoredHeliodonRadiusFactor, resolveHeliodonRadiusFactor } from "../../lib/heliodonRadius";
import { defaultParkRuleId } from "../../lib/solarRuleRegistry";
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
    parkRuleId: defaultParkRuleId(),
    sunHours: false,
  };
}
