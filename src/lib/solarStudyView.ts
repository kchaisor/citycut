import type { ActiveAnalyses } from "./sidebarSections";
import type { SolarViewSettings } from "../components/SolarHeliodon";

export function solarStudyViewActive(analyses: ActiveAnalyses): boolean {
  return analyses.solar;
}

export function solarSettingsForActiveAnalysis(solar: SolarViewSettings, analyses: ActiveAnalyses): SolarViewSettings {
  const active = solarStudyViewActive(analyses);
  const showPath = solar.showPath && active;
  const sunHours = solar.sunHours && active;
  if (showPath === solar.showPath && sunHours === solar.sunHours) return solar;
  return sunHours === undefined ? { ...solar, showPath } : { ...solar, showPath, sunHours };
}

export function solarSettingsOnStudyStart(solar: SolarViewSettings): SolarViewSettings {
  return solar.castShadows && solar.showPath ? solar : { ...solar, castShadows: true, showPath: true };
}

export function windFlowActive(windEnabled: boolean, analyses: ActiveAnalyses): boolean {
  return windEnabled && analyses.wind;
}

export function windDiagramActive(streaksOn: boolean, analyses: ActiveAnalyses): boolean {
  return streaksOn && analyses.wind;
}
