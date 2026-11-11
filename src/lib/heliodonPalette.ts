import { getColour } from "./colours";
import { themeSheetColor } from "./drawingSheet";
import { themeColor } from "./themeColor";

export const HELIODON_BACKGROUND_KEY = "--model-bg";

export type HeliodonPalette = {
  casing: string;
  halo: string;
  ink: string;
  grey: string;
  sun: string;
};

export function heliodonPalette(): HeliodonPalette {
  const background = themeColor(HELIODON_BACKGROUND_KEY, themeSheetColor("--background"));
  return {
    casing: background,
    halo: background,
    ink: getColour("--sun-compass-label"),
    grey: getColour("--sun-compass"),
    sun: getColour("--sun-marker"),
  };
}
