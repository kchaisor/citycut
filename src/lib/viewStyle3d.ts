import { getColour } from "./colours";

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
