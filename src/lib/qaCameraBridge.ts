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
      getSummary?: () => { buildingCount: number; roadCount: number; triangleCount: number };
      /** Pick a building for height edit (same path as 3D selection). */
      selectHeightEditBuilding?: (buildingId: number) => number;
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
    };
    __citycutQaSelectionAudit?: import("./buildingSelectionAudit").BuildingSelectionAudit;
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
