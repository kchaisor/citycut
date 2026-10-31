/** Dev / QA only: programmatic perspective camera when `?qa=1` is in the URL. */
export type QaCameraPose = {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

export type QaCameraBridge = {
  setCamera: (pose: QaCameraPose) => void;
  getCamera: () => QaCameraPose | null;
  /** Fit the perspective camera to the sun path dome, labels, and sun icon. */
  frameHeliodon: () => void;
  projectToScreen: (world: { x: number; y: number; z: number }) => { x: number; y: number } | null;
  pickBuildingAtClient: (clientX: number, clientY: number) => number | null;
};

export type QaSiteSnapshot = {
  parcelPfi: string | null | undefined;
  parcelSpi: string | null | undefined;
  siteBuildingIds: number[];
  overlaps: { id: number; overlapPercent: number; selected: boolean }[];
};

declare global {
  interface Window {
    __citycutQa?: QaCameraBridge;
    __citycutQaSite?: QaSiteSnapshot;
    /** QA only: programmatic height-edit pick for screenshots. */
    __citycutQaModel?: {
      openMidriseHeightEdit: () => number | null;
      pickBuildingNearGeoQa?: (lat: number, lon: number) => number | null;
      getSummary?: () => { treeCrowns: number; buildingCount: number; roadCount: number; triangleCount: number };
      /** Pick a building for height edit (same path as 3D selection). */
      selectHeightEditBuilding?: (buildingId: number) => number;
      openAnchoredLensForBuilding?: (buildingId: number) => number;
      getAnchoredLensScreenPosition?: () => { x: number; y: number } | null;
      getAnchoredLensLayout?: () => {
        width: number;
        height: number;
        centerX: number;
        centerY: number;
        onScreen: boolean;
      } | null;
      findTallBuildingForLensQa?: () => {
        id: number;
        clickX: number;
        clickY: number;
        height: number;
        dist: number;
      } | null;
      resolveLensBuildingClick?: (buildingId: number) => { clickX: number; clickY: number } | null;
      /** ~16 m foreground block for selection QA screenshots. */
      pickForegroundBuildingForSelectionQa?: () => number | null;
      frameSelectionBuilding?: (buildingId: number, variant?: "through" | "oblique") => boolean;
      pickTallTowerForSelectionQa?: () => number | null;
      frameAerialSelectionBuilding?: (buildingId: number) => boolean;
      clearHeightSelection?: () => void;
      selectionScreenClip?: (
        buildingId: number,
        padPx?: number,
      ) => { x: number; y: number; width: number; height: number } | null;
      /** Footprints for QA framing (local metres). */
      listBuildings?: () => { id: number; height: number; east: number; north: number }[];
      /** Minimal city model for plan-path QA exports (`?qa=1` only). */
      exportPlanSnapshot?: () => import("../types").CityModel;
      pickZoneDefaultPanelQa?: () => { id: number; height: number; note: string } | null;
      getHeightPerfTimings?: () => {
        modelOpenMs: number;
        firstRenderMs: number | null;
        comAppliedMs: number | null;
      };
      waitForComHeightsApplied?: (timeoutMs?: number) => Promise<{
        comAppliedMs: number | null;
        firstRenderMs: number | null;
      }>;
      /** Offscreen WebGL render for headless 3D QA screenshots. */
      captureViewportPng?: () => Promise<string | null>;
    };
    __citycutQaSelectionAudit?: import("./buildingSelectionAudit").BuildingSelectionAudit;
    __citycutFrameRatio?: number;
    __citycutMinBeat2Ms?: number;
    __citycutMinSilentLoadMs?: number;
    __citycutIntroPaused?: boolean;
    __citycutAwaitIntroStart?: boolean;
    __citycutIntroStarted?: boolean;
    __citycutWebglPrewarmReady?: boolean;
    __citycutModelPrewarmMounted?: boolean;
    __citycutIntroStartMs?: number;
    __citycutFirstTiltFrameMs?: number;
    __citycutProgressSamples?: number[];
    __citycutLoadProgress?: number;
    __citycutIntroReadyToFire?: boolean;
  }
}

export function qaModeFromSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("qa") === "1";
}

/** Dev-only: `?qa=crash` throws on the next render so QA can capture the app error boundary. */
export function qaForcedCrashFromSearch(search: string): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("qa") === "crash";
}

export function qaHideHeightPopoverFromSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("qaHidePopover") === "1";
}

export function registerQaCameraBridge(bridge: QaCameraBridge | null): void {
  if (typeof window === "undefined") return;
  if (bridge) window.__citycutQa = bridge;
  else delete window.__citycutQa;
}
