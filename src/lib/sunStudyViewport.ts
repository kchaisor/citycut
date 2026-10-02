/** Viewport lighting while the sun path / compass is on (screen-only building whites). */
export type SunStudyLighting = {
  fillKeyLight: number;
  fillAmbient: number;
  fillHemi: number;
  sunIntensity: number;
  noToneMapping: boolean;
};

export function sunStudyViewportLighting(options: {
  showPath: boolean;
  castShadows: boolean;
}): SunStudyLighting {
  if (!options.showPath) {
    return {
      fillKeyLight: options.castShadows ? 0 : 1.35,
      fillAmbient: options.castShadows ? 0.08 : 0.28,
      fillHemi: options.castShadows ? 0.34 : 0.7,
      sunIntensity: 2.35,
      noToneMapping: false,
    };
  }
  if (options.castShadows) {
    return {
      fillKeyLight: 0.14,
      fillAmbient: 0.18,
      fillHemi: 0.55,
      sunIntensity: 4.4,
      noToneMapping: true,
    };
  }
  return {
    fillKeyLight: 1.35,
    fillAmbient: 0.32,
    fillHemi: 0.78,
    sunIntensity: 2.35,
    noToneMapping: true,
  };
}
