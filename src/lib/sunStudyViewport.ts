import { primaryViewportLighting } from "./primaryViewport";

export interface SunStudyLighting {
  fillKeyLight: number;
  fillAmbient: number;
  fillHemi: number;
  sunIntensity: number;
  noToneMapping: boolean;
}

export function sunStudyViewportLighting(options: {
  showPath: boolean;
  castShadows: boolean;
}): SunStudyLighting {
  return {
    fillKeyLight: options.castShadows ? 0 : 1.35,
    fillAmbient: options.castShadows ? 0.08 : 0.28,
    fillHemi: options.castShadows ? 0.34 : 0.7,
    sunIntensity: 2.35,
    noToneMapping: false,
  };
}

export const SOLAR_PRIMARY_SHADOW_LIGHTING: SunStudyLighting = {
  fillKeyLight: 0,
  fillAmbient: 0.07,
  fillHemi: 0.2,
  sunIntensity: 6.5,
  noToneMapping: true,
};

export const SOLAR_NIGHT_LIGHTING: Omit<SunStudyLighting, "noToneMapping"> = {
  fillKeyLight: 0,
  fillAmbient: 0.12,
  fillHemi: 0.36,
  sunIntensity: 0,
};

export function studioSceneLighting(options: {
  primaryView: boolean;
  showPath: boolean;
  castShadows: boolean;
  solarAnalysisActive: boolean;
  sunAboveHorizon: boolean;
}): SunStudyLighting {
  const study = sunStudyViewportLighting({
    showPath: options.showPath && !options.primaryView,
    castShadows: options.castShadows,
  });
  if (options.solarAnalysisActive && !options.sunAboveHorizon) {
    return { ...SOLAR_NIGHT_LIGHTING, noToneMapping: options.primaryView };
  }
  if (!options.primaryView) return study;
  if (options.solarAnalysisActive && options.castShadows) return { ...SOLAR_PRIMARY_SHADOW_LIGHTING };
  return { ...primaryViewportLighting(true), sunIntensity: study.sunIntensity, noToneMapping: true };
}
