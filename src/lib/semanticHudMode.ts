export type SemanticHudMode = "overview" | "building" | "walk";

export type SemanticHudSignals = {
  eyeHeightM: number;
  pitchDeg: number;
  polarDeg: number;
  orbitDistanceM: number;
  minOrbitDistanceM: number;
  maxOrbitDistanceM: number;
  centreGroundDistanceM: number | null;
  centreBuildingDistanceM: number | null;
  centreHasNamedStreet: boolean;
  hasCentreBuilding: boolean;
  buildingScreenFill: number;
};

export type SemanticHudThresholds = {
  walkEnterOrbitFactor: number;
  walkExitOrbitFactor: number;
  walkEnterGroundFactor: number;
  walkExitGroundFactor: number;
  walkEnterPolarDeg: number;
  walkExitPolarDeg: number;
  buildingEnterDistanceFactor: number;
  buildingExitDistanceFactor: number;
  buildingEnterZoomCloseT: number;
  buildingExitZoomCloseT: number;
  buildingEnterScreenFill: number;
  buildingExitScreenFill: number;
};

export const DEFAULT_SEMANTIC_HUD_THRESHOLDS: SemanticHudThresholds = {
  walkEnterOrbitFactor: 1.15,
  walkExitOrbitFactor: 1.32,
  walkEnterGroundFactor: 1.35,
  walkExitGroundFactor: 1.55,
  walkEnterPolarDeg: 63,
  walkExitPolarDeg: 57,
  buildingEnterDistanceFactor: 1.5,
  buildingExitDistanceFactor: 1.85,
  buildingEnterZoomCloseT: 0.35,
  buildingExitZoomCloseT: 0.28,
  buildingEnterScreenFill: 0.045,
  buildingExitScreenFill: 0.025,
};

export function perspectiveOrbitMinDistanceM(sideM: number): number {
  return Math.max(40, sideM * 0.06);
}

export function semanticHudModeLabel(mode: SemanticHudMode): string {
  if (mode === "building") return "Building";
  if (mode === "walk") return "Street";
  return "Site";
}

export function orbitZoomCloseT(signals: SemanticHudSignals): number {
  const span = signals.maxOrbitDistanceM - signals.minOrbitDistanceM;
  if (span <= 1e-3) return 0;
  return Math.min(1, Math.max(0, 1 - (signals.orbitDistanceM - signals.minOrbitDistanceM) / span));
}

function walkProximityM(signals: SemanticHudSignals): number {
  const ground = signals.centreGroundDistanceM;
  if (ground != null && ground > 0) return Math.min(signals.orbitDistanceM, ground);
  return signals.orbitDistanceM;
}

function walkCandidate(signals: SemanticHudSignals, thresholds: SemanticHudThresholds, entering: boolean): boolean {
  const min = signals.minOrbitDistanceM;
  const orbitLimit = min * (entering ? thresholds.walkEnterOrbitFactor : thresholds.walkExitOrbitFactor);
  const groundLimit = min * (entering ? thresholds.walkEnterGroundFactor : thresholds.walkExitGroundFactor);
  const polarLimit = entering ? thresholds.walkEnterPolarDeg : thresholds.walkExitPolarDeg;
  if (walkProximityM(signals) > orbitLimit) return false;
  if (signals.polarDeg < polarLimit) return false;
  if (signals.centreGroundDistanceM == null || signals.centreGroundDistanceM > groundLimit) return false;
  if (!signals.centreHasNamedStreet) return false;
  return true;
}

function buildingBlockedByWalkProximity(signals: SemanticHudSignals): boolean {
  const min = signals.minOrbitDistanceM;
  if (signals.centreGroundDistanceM == null) return false;
  return (
    signals.centreGroundDistanceM <= min * 1.2 &&
    signals.polarDeg >= 60 &&
    signals.orbitDistanceM <= min * 1.4
  );
}

function buildingCandidate(signals: SemanticHudSignals, thresholds: SemanticHudThresholds, entering: boolean): boolean {
  if (walkCandidate(signals, thresholds, true)) return false;
  if (buildingBlockedByWalkProximity(signals)) return false;
  const min = signals.minOrbitDistanceM;
  const distanceLimit = min * (entering ? thresholds.buildingEnterDistanceFactor : thresholds.buildingExitDistanceFactor);
  const zoomLimit = entering ? thresholds.buildingEnterZoomCloseT : thresholds.buildingExitZoomCloseT;
  const fillLimit = entering ? thresholds.buildingEnterScreenFill : thresholds.buildingExitScreenFill;
  const zoomClose = orbitZoomCloseT(signals);
  const nearCentre =
    signals.centreBuildingDistanceM != null && signals.centreBuildingDistanceM <= distanceLimit;
  const zoomBand = zoomClose >= zoomLimit && signals.hasCentreBuilding;
  return nearCentre || zoomBand || signals.buildingScreenFill >= fillLimit;
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
