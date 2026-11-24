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
  if (isWhiteCard3dView(primaryView, colourByUse, colourBySource)) return getColour("--primary-surface");
  return getColour("--road-local");
}

export function viewStyleFootpathChipColor(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): string {
  if (usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource)) return getColour("--primary-footpath");
  if (isWhiteCard3dView(primaryView, colourByUse, colourBySource)) return getColour("--primary-surface");
  return getColour("--road-path");
}

export function viewStyleRoadColourTokens(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): ColourKey[] {
  const drawing: ColourKey[] = ["--road-local", "--road-arterial", "--road-fill"];
  return usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource) ? ["--primary-road", ...drawing] : drawing;
}

export function viewStyleFootpathColourTokens(
  primaryView: boolean,
  colourByUse: boolean,
  colourBySource: boolean,
): ColourKey[] {
  const drawing: ColourKey[] = ["--road-path", "--path-fill"];
  return usesPrimaryRoadCanvas(primaryView, colourByUse, colourBySource) ? ["--primary-footpath", ...drawing] : drawing;
}
