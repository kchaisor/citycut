import { getColour, type ColourKey } from "./colours";

export function isWhiteCard3dView(primaryView: boolean, colourByUse: boolean, colourBySource: boolean): boolean {
  return !primaryView && !colourByUse && !colourBySource;
}

export function usesPrimaryRoadCanvas(primaryView: boolean, colourByUse: boolean, colourBySource: boolean): boolean {
  return primaryView || colourByUse || colourBySource;
}

export function viewStyleRoadChipColor(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): string {
  if (usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource)) return getColour("--primary-road");
  if (isWhiteCard3dView(primaryView, colourByUse, colourBySource)) return getColour("--card-road");
  return getColour("--road-local");
}

export function viewStyleFootpathChipColor(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): string {
  if (usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource)) return getColour("--primary-footpath");
  if (isWhiteCard3dView(primaryView, colourByUse, colourBySource)) return getColour("--card-footpath");
  return getColour("--road-path");
}

export function viewStyleRoadColourTokens(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): ColourKey[] {
  const drawing: ColourKey[] = ["--road-local", "--road-arterial", "--road-fill"];
  if (usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource)) return ["--primary-road", ...drawing];
  return isWhiteCard3dView(primaryView, colourByUse, colourBySource) ? ["--card-road", ...drawing] : drawing;
}

export function viewStyleFootpathColourTokens(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): ColourKey[] {
  const drawing: ColourKey[] = ["--road-path", "--path-fill"];
  if (usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource)) return ["--primary-footpath", ...drawing];
  return isWhiteCard3dView(primaryView, colourByUse, colourBySource) ? ["--card-footpath", ...drawing] : drawing;
}
