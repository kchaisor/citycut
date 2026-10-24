export interface SunStudyLighting {
  fillKeyLight: number;
  fillAmbient: number;
  fillHemi: number;
  sunIntensity: number;
  /** Keep renderer tone mapping unchanged (`false` = `ACESFilmicToneMapping`). */
  noToneMapping: boolean;
}

/**
 * Viewport light rig intensities for the 3D scene.
 *
 * Toggling the sun-path diagram (`showPath`) only shows or hides the heliodon and compass
 * overlay; it must not alter scene lighting, shadow intensity, or renderer tone mapping.
 */
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
