import type { BuildingFeat } from "../types";
import type { SemanticHudMode } from "./semanticHudMode";

export type SemanticHudLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  scale: number;
  kind: "street" | "building";
};

export type SemanticHudWalkReadout = {
  streetName: string | null;
  streetNameSource: string;
  roadWidthM: number | null;
  leftHeightM: number | null;
  rightHeightM: number | null;
};

export type SemanticHudBuildingReadout = {
  building: BuildingFeat;
  heightM: number;
  heightSource: string;
  floors: number;
  floorsEstimated: boolean;
  floorsSource: string;
  floorsConflictNote: string | null;
  useLabel: string;
  footprintM2: number;
  gfaM2: number;
  gfaFromHeightStoreys: boolean;
};

export type SemanticHudSample = {
  mode: SemanticHudMode;
  eyeHeightM: number;
  pitchDeg: number;
  building: SemanticHudBuildingReadout | null;
  walk: SemanticHudWalkReadout | null;
  labels: SemanticHudLabel[];
};

export const EMPTY_SEMANTIC_HUD_SAMPLE: SemanticHudSample = {
  mode: "overview",
  eyeHeightM: 0,
  pitchDeg: 0,
  building: null,
  walk: null,
  labels: [],
};
