import { getColour } from "./colours";
import { themeSheetColor } from "./drawingSheet";
import { themeColor } from "./themeColor";

/** The theme variable the 3D canvas paints as its background (see Scene3D). */
export const HELIODON_BACKGROUND_KEY = "--model-bg";

export type HeliodonPalette = {
  /** Halo behind every heliodon label and casing around every heliodon line: the 3D background. */
  casing: string;
  halo: string;
  ink: string;
  grey: string;
  sun: string;
};

export function heliodonPalette(): HeliodonPalette {
  const background = themeColor(HELIODON_BACKGROUND_KEY, themeSheetColor(HELIODON_BACKGROUND_KEY));
  return {
    casing: background,
    halo: background,
    ink: getColour("--sun-compass-label"),
    grey: getColour("--sun-compass"),
    sun: getColour("--sun-marker"),
  };
}
