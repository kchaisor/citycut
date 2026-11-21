import type { ActiveAnalysis } from "./sidebarSections";
import type { SolarViewSettings } from "../components/SolarHeliodon";

export function solarStudyViewActive(analysisKind: ActiveAnalysis): boolean {
  return analysisKind === "solar";
}

export function solarSettingsForActiveAnalysis(solar: SolarViewSettings, analysisKind: ActiveAnalysis): SolarViewSettings {
  const showPath = solar.showPath && solarStudyViewActive(analysisKind);
  return showPath === solar.showPath ? solar : { ...solar, showPath };
}

export function windFlowActive(windEnabled: boolean, analysisKind: ActiveAnalysis): boolean {
  return windEnabled && analysisKind === "wind";
}
