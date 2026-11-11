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
