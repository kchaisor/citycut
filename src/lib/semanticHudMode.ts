export type SemanticHudMode = "overview" | "building" | "walk";

export type SemanticHudSignals = {
  eyeHeightM: number;
  pitchDeg: number;
  nearestBuildingDistanceM: number | null;
  buildingScreenFill: number;
};

export type SemanticHudThresholds = {
  walkEnterEyeHeightM: number;
  walkExitEyeHeightM: number;
  walkEnterMaxPitchDeg: number;
  walkExitMaxPitchDeg: number;
  buildingEnterDistanceM: number;
  buildingExitDistanceM: number;
  buildingEnterScreenFill: number;
  buildingExitScreenFill: number;
};

export const DEFAULT_SEMANTIC_HUD_THRESHOLDS: SemanticHudThresholds = {
  walkEnterEyeHeightM: 10,
  walkExitEyeHeightM: 12,
  walkEnterMaxPitchDeg: 14,
  walkExitMaxPitchDeg: 18,
  buildingEnterDistanceM: 150,
  buildingExitDistanceM: 185,
  buildingEnterScreenFill: 0.1,
  buildingExitScreenFill: 0.07,
};

function walkCandidate(signals: SemanticHudSignals, thresholds: SemanticHudThresholds, entering: boolean): boolean {
  const eyeLimit = entering ? thresholds.walkEnterEyeHeightM : thresholds.walkExitEyeHeightM;
  const pitchLimit = entering ? thresholds.walkEnterMaxPitchDeg : thresholds.walkExitMaxPitchDeg;
  return signals.eyeHeightM <= eyeLimit && signals.pitchDeg <= pitchLimit;
}

function buildingCandidate(signals: SemanticHudSignals, thresholds: SemanticHudThresholds, entering: boolean): boolean {
  const walkEyeLimit = entering ? thresholds.walkEnterEyeHeightM : thresholds.walkExitEyeHeightM;
  if (signals.eyeHeightM <= walkEyeLimit) return false;
  const distanceLimit = entering ? thresholds.buildingEnterDistanceM : thresholds.buildingExitDistanceM;
  const fillLimit = entering ? thresholds.buildingEnterScreenFill : thresholds.buildingExitScreenFill;
  const near =
    signals.nearestBuildingDistanceM != null && signals.nearestBuildingDistanceM <= distanceLimit;
  return near || signals.buildingScreenFill >= fillLimit;
}

export function resolveSemanticHudMode(
  previous: SemanticHudMode,
  signals: SemanticHudSignals,
  thresholds: SemanticHudThresholds = DEFAULT_SEMANTIC_HUD_THRESHOLDS,
): SemanticHudMode {
  if (previous === "walk" && walkCandidate(signals, thresholds, false)) return "walk";
  if (walkCandidate(signals, thresholds, true)) return "walk";
  if (previous === "building" && buildingCandidate(signals, thresholds, false)) return "building";
  if (buildingCandidate(signals, thresholds, true)) return "building";
  return "overview";
}

export function cameraPitchDegFromEyeTarget(eye: [number, number, number], target: [number, number, number]): number {
  const dx = eye[0] - target[0];
  const dy = eye[1] - target[1];
  const dz = eye[2] - target[2];
  const horizontal = Math.hypot(dx, dz);
  return (Math.atan2(Math.abs(dy), horizontal) * 180) / Math.PI;
}
