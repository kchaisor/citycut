export type QaCameraPose = {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

export type QaCameraBridge = {
  setCamera: (pose: QaCameraPose) => void;
  getCamera: () => QaCameraPose | null;
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
    __citycutQaMassing?: {
      enableTool: () => void;
      disableTool: () => void;
      armDraw: () => void;
      disarmDraw: () => void;
      simulateDraw: (east0: number, north0: number, east1: number, north1: number) => string | null;
      getBlocks: () => import("./massingBlock").MassingBlock[];
      selectBlock: (id: string) => void;
      setFloors: (floors: number) => void;
      deleteSelected: () => void;
      readPersistedCount: () => number;
      selectParcels: (ids: string[]) => void;
      clearParcels: () => void;
      qaFocusParcelHover: (parcelId: string) => boolean;
      nearestParcelIds: (count: number) => string[];
      getParcelState: () => { selectedIds: string[]; boundaryPolygons: number };
      sampleInsideBoundary: () => [number, number] | null;
      pointInSiteBoundary: (east: number, north: number) => boolean;
      qaGroundPress: (east: number, north: number) => void;
      qaGroundRelease: () => void;
      qaGroundMove: (east: number, north: number) => void;
      finishDraw: () => import("./massingBlock").MassingBlock | null;
      commitPolylineCenterline: (
        points: [number, number][],
        partial?: { width_m?: number; floors?: number; floorHeight_m?: number; flipped?: boolean },
      ) => string | null;
      clearDrawnBlocks?: () => void;
      getToolPhase: () => string;
      drawArmed: () => boolean;
    };
    __citycutQaModel?: {
      openMidriseHeightEdit: () => number | null;
      pickBuildingNearGeoQa?: (lat: number, lon: number) => number | null;
      getSummary?: () => { treeCrowns: number; buildingCount: number; roadCount: number; triangleCount: number };
      selectHeightEditBuilding?: (buildingId: number) => number;
      pickForegroundBuildingForSelectionQa?: () => number | null;
      frameSelectionBuilding?: (buildingId: number, variant?: "through" | "oblique") => boolean;
      pickTallTowerForSelectionQa?: () => number | null;
      frameAerialSelectionBuilding?: (buildingId: number) => boolean;
      clearHeightSelection?: () => void;
      selectionScreenClip?: (
        buildingId: number,
        padPx?: number,
      ) => { x: number; y: number; width: number; height: number } | null;
      listBuildings?: () => { id: number; height: number; east: number; north: number }[];
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
      captureViewportPng?: () => Promise<string | null>;
      setQaProposedMassingBox?: (east?: number, north?: number, size?: number, height?: number) => boolean;
      clearQaProposedMassing?: () => void;
      setDrawingPlanViewport?: (east: number, north: number, spanM: number) => boolean;
      enableSolarAccess?: () => boolean;
      addSolarReceptor?: (
        east0: number,
        north0: number,
        east1: number,
        north1: number,
        id?: string,
      ) => string | null;
      clearSolarReceptors?: () => void;
      readSolarReceptorAssess?: () => import("./solarReceptorAssess").SolarAssessRow[];
      enableSolarParkAccess?: (ruleId?: string) => boolean;
      addSolarParkReceptor?: (
        east0: number,
        north0: number,
        east1: number,
        north1: number,
        id?: string,
        ruleId?: string,
      ) => string | null;
      readLargestGreenAreaBounds?: () => {
        east0: number;
        north0: number;
        east1: number;
        north1: number;
      } | null;
      addSolarParkFromLargestGreen?: (id?: string, ruleId?: string) => string | null;
      setSolarPlanTime?: (hour: number, minute?: number) => boolean;
      enableSunHoursLost?: () => boolean;
      enableTreeShadows?: () => boolean;
      readSunHoursLostPlan?: () => { cellCount: number; maxLoss: number; cellM?: number };
    };
    __citycutWalkRippleQa?: {
      setMinutes: (minutes: number) => void;
      getMinutes: () => number;
      getUniformMinutes: () => number;
      countReachedBuildings: (minuteCutoff: number) => number;
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
