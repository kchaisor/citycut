import { ReliabilityLegend } from "./ReliabilityLegend";
import { sunStudyCasterModel, sunStudyMutedOn, toggleSelection, type SunStudyDate } from "../lib/sunStudyPlan";
import { sunStudyLayersFor } from "./useSunStudyShadows";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import { AXO_TERRAIN_EXAGGERATION_RANGE, DEFAULT_AXO_TERRAIN_EXAGGERATION } from "../lib/explodedAxoTerrain";
import { Building2, Copy, Download, DraftingCompass, Eye, GripVertical, Info, Radar, Sun, Trees, Upload, Wind } from "lucide-react";
import {
  BUILDING_USES,
  BUILDING_USE_META,
  SOURCE_COUNT_KEYS,
  SOURCE_META,
  countSourcesGrouped,
  countUses,
  uniformBuildingColor,
} from "../lib/buildingUse";
import { commitColour, getColour, resetStoredColours } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { CRS_NOTE, mgaCrs } from "../lib/crsZone";
import {
  applyOverrides,
  readDrawingStyle,
  readStoredOverrides,
  type LineStyles,
} from "../lib/drawingStyle";
import {
  download3dm,
  downloadBlob,
  downloadExplodedAxoAi,
  downloadFigureAi,
  downloadIsometricAi,
  downloadIsometricSvg,
  downloadSiteAi,
  downloadSiteSvg,
  downloadFigureSvg,
  downloadSunStudyZip,
  pngFilename,
} from "../lib/download";
import { sunStudyDateText } from "../lib/sunStudyExport";
import {
  AXO_LAYER_LABELS,
  defaultExplodedAxoGapM,
  defaultExplodedAxoSettings,
  referenceExplodedAxoSettings,
  AXO_REFERENCE_BUILDING_GAP_FACTOR,
  explodedAxoBounds,
  liftsForLayerOrder,
  reorderAxoLayer,
  type AxoLayerId,
  type ExplodedAxoSettings,
} from "../lib/explodedAxo";
import { explodedAxoViewportExtent, planViewportExtent, type PlanViewport } from "../lib/planViewport";
import { FIGURE_SCALES, preferredFigureScale, sheetFitMessage } from "../lib/figureGround";
import {
  fetchComBuildingFootprints,
  intersectsComCity,
  paddedComFetchBounds,
  type ComBuildingFootprint,
} from "../lib/comBuildingHeights";
import { countBuildingsWithComHeightTier } from "../lib/comBuildingHeightsCount";
import { runComBuildingHeightsInWorker } from "../lib/comBuildingHeightsWorkerClient";
import {
  COM_BUILDING_HEIGHTS_CREDIT,
  COM_BUILDING_HEIGHTS_DATASET_URL,
} from "../lib/comBuildingHeightCredit";
import {
  clearLegacyComBuildingHeightsPreference,
  comBuildingHeightsStatus,
  comBuildingHeightsStatusNote,
} from "../lib/comBuildingHeightsStatus";
import { resolveBuildingHeightsAfterCom } from "../lib/buildingHeightPipeline";
import { formatCoord, formatLengthKm } from "../lib/geo";
import { useSidebarCollapsed } from "../lib/sidebarCollapse";
import { cutSizeLabel } from "../lib/placeLabel";
import { ISO_CORNERS, type IsoCorner } from "../lib/isoCamera";
import {
  SIDEBAR_SECTION_LABELS,
  SITE_ANALYSIS_KINDS,
  SITE_ANALYSIS_LABELS,
  availableSidebarSections,
  initialSidebarState,
  isRightSidebarSection,
  reduceSidebar,
  resolveLeftSidebarSection,
  resolveRightSidebarSection,
  resolveSidebarSection,
  type LeftSidebarSectionId,
  type RightSidebarSectionId,
  type SidebarSectionId,
  type SiteAnalysisKind,
} from "../lib/sidebarSections";
import { buildDataSources, countLoaded, dataSourceStatusWord } from "../lib/dataSources";
import { OSM_TREES_ODBL_CREDIT } from "../lib/treesPrebake";
import { countTreeCrowns } from "../lib/treeMassing";
import { capturePresetFromSearch } from "../lib/captureQuery";
import { qaHideHeightPopoverFromSearch, qaModeFromSearch } from "../lib/qaCameraBridge";
import {
  resolveView,
  VIEW_STORAGE_KEY,
  writeStoredView,
  writeViewSearch,
  type ViewMemory,
} from "../lib/viewMemory";
import { treeSizeSummary, treeTierCounts } from "../lib/trees";
import { contourDrawerLabel } from "../lib/vicmapContours";
import { clearPlanShadowCache } from "../lib/buildingShadows";
import {
  appendManualHeightCredit,
  applyHeightOverrides,
  clearAllHeightOverrides,
  exportHeightOverridesJson,
  importHeightOverridesJson,
  mergeHeightOverrideStores,
  readStoredHeightOverrides,
  readStoredShowManualHeights,
  removeOverrideForBuilding,
  upsertOverrideForBuilding,
  writeStoredHeightOverrides,
  writeStoredShowManualHeights,
  type HeightOverrideStore,
} from "../lib/heightOverrides";
import {
  annotateUnresolvedZoneDefaults,
  heightTierLabel,
  stampPlainZoneDefaultLabels,
} from "../lib/buildingHeightResolve";
import { countBuildingHeightTiers, LIDAR_NO_DATA_LINE } from "../lib/lidarTierStatus";
import { buildCityGroup, disposeObject } from "../lib/buildCity";
import { VICMAP_ATTRIBUTION } from "../lib/vicmapTrees";
import { COM_TREES_CREDIT, COM_TREES_DATASET_URL } from "../lib/comTreesCredit";
import { openRing, toLocal } from "../lib/geo";
import { pointInPolygon } from "../lib/useCascade";
import type { BuildingUse, CityModel } from "../types";
import { BuildingHeightPopover, HeightOverridePanel, HiddenBuildingsPanel } from "./BuildingHeightPopover";
import {
  filterHiddenBuildings,
  hideBuildings,
  matchHiddenBuildings,
  readStoredHiddenBuildings,
  showAllInCut,
  showHiddenEntry,
  writeStoredHiddenBuildings,
  type HiddenBuildingStore,
} from "../lib/hiddenBuildings";
import { ImportMassingPanel } from "./ImportMassingPanel";
import { useImportedMassing } from "./useImportedMassing";
import { snapWhenTogglingIsoFreeRotate } from "../lib/isoFreeRotate";
import { DrawingPlan, type DrawingKind } from "./DrawingPlan";
import { DrawingExplodedAxo } from "./DrawingExplodedAxo";
import { DrawingIsometric } from "./DrawingIsometric";
import { isometricDrawingBounds } from "../lib/isometricDrawing";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { SatellitePane } from "./SatellitePane";
import { Scene3D, type SceneExporter } from "./Scene3D";

function shouldShowIntroBridgePill(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (/jsdom|HappyDOM/i.test(navigator.userAgent ?? "")) return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (qaModeFromSearch(window.location.search)) return false;
  return true;
}
import type { CameraMemoryRef } from "../lib/cameraMemory";
import { SceneBoundary } from "./SceneBoundary";
import { SolarPanel } from "./SolarPanel";
import { WindPanel } from "./WindPanel";
import { WindRoseOverlay } from "./WindRoseOverlay";
import { ExportTiles } from "./ExportTiles";
import { exportTiles, type ExportBusy } from "../lib/exportTiles";
import { ViewLegend, ViewPanel } from "./ViewPanel";
import { useWalkPlayback, useWalkViewshed, WALK_SPEEDS } from "./useWalkViewshed";
import { fetchWindRoseTable } from "../lib/windFetch";
import { analyzeWindPeriod, WIND_PERIOD_LABELS, type WindPeriodId, type WindRoseTable } from "../lib/windRose";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "../lib/solar";
import {
  windSettingsForModelOpen,
  writeStoredWindSettings,
  type WindViewSettings,
} from "../lib/windState";
import { useWindStreakMotion } from "../lib/windStreakMotion";
import type { SitePlanExportOptions } from "../lib/aiPlan";
import type { PlanShadowInput } from "../lib/buildingShadows";
import type { HeliodonDiagramExportOptions, HeliodonGroundExportOptions } from "../lib/heliodonDiagram";
import {
  readStoredHeliodonRadiusFactor,
  resolveHeliodonRadiusFactor,
  writeStoredHeliodonRadiusFactor,
} from "../lib/heliodonRadius";
import type { SolarViewSettings } from "./SolarHeliodon";
import {
  isLayer3dVisible,
  setLayer3dVisible,
  view3dDisplayForModelOpen,
  writeStoredView3dDisplay,
  type Layer3dId,
  type View3dDisplaySettings,
} from "../lib/view3dDisplay";

type Tab = "3d" | "drawing" | "satellite";

const SIDEBAR_PANEL_ID = "model-sidebar-panel";
const RIGHT_SIDEBAR_PANEL_ID = "model-sidebar-right-panel";
const iconProps = { size: 18, strokeWidth: 1.75, "aria-hidden": true as const };

const CORNER_LABEL: Record<IsoCorner, string> = {
  ne: "NE",
  nw: "NW",
  se: "SE",
  sw: "SW",
};

function loadView(): ViewMemory {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const resolved = resolveView(stored, window.location.search);
  if (typeof window !== "undefined" && window.__citycutAwaitIntroStart) {
    return { ...resolved, projection: "perspective", freeRotate: false };
  }
  return resolved;
}

/** Height-source tier to its swatch in the Model details height bar. */
const HEIGHT_TIER_BAR: Record<string, string> = {
  com: "measured",
  lidar: "lidar",
  overture_height: "overture",
  overture_floors: "overture",
  osm_levels: "overture",
  development_floors: "floors",
  zone_default: "estimate",
  real_source_unmatched: "estimate",
  manual: "manual",
};

const SECTION_ICONS: Record<SidebarSectionId, typeof Info> = {
  summary: Info,
  buildings: Building2,
  trees: Trees,
  drawing: DraftingCompass,
  analysis: Radar,
  import: Upload,
  exports: Download,
};

const ANALYSIS_ICONS: Record<SiteAnalysisKind, typeof Sun> = {
  solar: Sun,
  wind: Wind,
  view: Eye,
};

export function ModelPage({ model, onHome, onNewCut }: { model: CityModel; onHome: () => void; onNewCut: () => void }) {
  const [tab, setTab] = useState<Tab>("3d");
  const [drawing, setDrawing] = useState<DrawingKind>("site");
  const [analysisKind, setAnalysisKind] = useState<SiteAnalysisKind>("solar");
  const [lineStyles, setLineStyles] = useState<LineStyles>(() => readDrawingStyle());
  useColourRevision();
  const uniform = uniformBuildingColor();
  const [figureScale, setFigureScale] = useState<number>(() => preferredFigureScale(model.sideM));
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportBusy>(null);
  const [sunStudyProgress, setSunStudyProgress] = useState<string | null>(null);
  const [colourByUse, setColourByUse] = useState(
    () => !capturePresetFromSearch(window.location.search).uniformBuildings,
  );
  const [showSource, setShowSource] = useState(false);
  const [showReliability, setShowReliability] = useState(
    () => capturePresetFromSearch(window.location.search).reliabilityBuildings,
  );
  const showSourceOrReliability = showSource || showReliability;
  function pickSourceStyle(next: boolean) {
    setShowSource(next);
    setShowReliability(false);
  }
  function pickReliabilityStyle() {
    setShowSource(false);
    setShowReliability(true);
  }
  /** Rhino export: buildings as triangle meshes instead of closed Extrusions. */
  const [buildingsAsMesh, setBuildingsAsMesh] = useState(false);
  const [comFootprints, setComFootprints] = useState<ComBuildingFootprint[]>(
    () => model.comFootprintPrefetch ?? [],
  );
  const [comFootprintFetchError, setComFootprintFetchError] = useState<string | null>(
    () => model.comFootprintFetchError ?? null,
  );
  const [comFootprintLoading, setComFootprintLoading] = useState(false);
  const [comFootprintRetryToken, setComFootprintRetryToken] = useState(0);
  const [comHeightsApplyFailed, setComHeightsApplyFailed] = useState(false);
  const [sidebar, dispatchSidebar] = useReducer(reduceSidebar, undefined, initialSidebarState);
  const [hiddenBuildingUses, setHiddenBuildingUses] = useState<Set<BuildingUse>>(() => new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const sidebarModelRef = useRef(model);
  useEffect(() => {
    // A new model always opens the sidebar on Display with all 3D layers turned on.
    if (sidebarModelRef.current === model) return;
    sidebarModelRef.current = model;
    dispatchSidebar({ type: "new-model" });
    setHiddenBuildingUses(new Set());
    const nextDisplay = view3dDisplayForModelOpen(window.localStorage);
    setView3dDisplay(nextDisplay);
    writeStoredView3dDisplay(window.localStorage, nextDisplay);
    if (typeof window !== "undefined" && window.__citycutAwaitIntroStart) {
      setView((prev) => {
        const next: ViewMemory = { ...prev, projection: "perspective", freeRotate: false };
        writeStoredView(window.localStorage, next);
        return next;
      });
    }
  }, [model]);
  const [planWidth, setPlanWidth] = useState<number | null>(null);
  const [fitCounter, setFitCounter] = useState(0);
  const [planViewport, setPlanViewport] = useState<PlanViewport>(() => planViewportExtent(model.sideM));
  const [axoSettings, setAxoSettings] = useState<ExplodedAxoSettings>(() => defaultExplodedAxoSettings(model.sideM));
  const [explodedViewport, setExplodedViewport] = useState<PlanViewport>(() =>
    planViewportExtent(model.sideM),
  );
  const [view, setView] = useState<ViewMemory>(loadView);
  const [isoDrawingViewport, setIsoDrawingViewport] = useState<PlanViewport>(() =>
    planViewportExtent(model.sideM),
  );
  const drawingViewportsInitializedRef = useRef<CityModel | null>(null);
  useEffect(() => {
    if (tab !== "drawing" || drawingViewportsInitializedRef.current === model) return;
    drawingViewportsInitializedRef.current = model;
    setExplodedViewport(
      explodedAxoViewportExtent(explodedAxoBounds(model, defaultExplodedAxoSettings(model.sideM))),
    );
    setIsoDrawingViewport(
      explodedAxoViewportExtent(isometricDrawingBounds(model, loadView().corner)),
    );
  }, [tab, model]);
  const [snapId, setSnapId] = useState(0);
  // The 3D view unmounts on Drawing/Satellite; this keeps the user's camera for the way back.
  // A new model gets a fresh memory, so a new cut is framed afresh.
  const cameraMemory = useMemo<CameraMemoryRef>(() => ({ current: null }), [model]);
  const [view3dDisplay, setView3dDisplay] = useState<View3dDisplaySettings>(() => {
    const next = view3dDisplayForModelOpen(window.localStorage);
    writeStoredView3dDisplay(window.localStorage, next);
    return next;
  });
  const [windSettings, setWindSettings] = useState<WindViewSettings>(() => {
    const next = windSettingsForModelOpen(window.localStorage);
    writeStoredWindSettings(window.localStorage, next);
    return next;
  });
  const [windTable, setWindTable] = useState<WindRoseTable | null>(null);
  const [windNote, setWindNote] = useState<string | null>(null);
  const windMotion = useWindStreakMotion();
  const [solar, setSolar] = useState<SolarViewSettings>(() => ({
    showPath: capturePresetFromSearch(window.location.search).solarPath,
    castShadows: false,
    radiusFactor: resolveHeliodonRadiusFactor(
      readStoredHeliodonRadiusFactor(window.localStorage),
      window.location.search,
    ),
    year: 2026,
    month: 9,
    day: 22,
    hour: 15,
    minute: 0,
  }));

  function commitSolar(next: SolarViewSettings) {
    writeStoredHeliodonRadiusFactor(window.localStorage, next.radiusFactor);
    setSolar(next);
  }

  const [sunStudySelected, setSunStudySelected] = useState<number[]>([]);
  useEffect(() => setSunStudySelected((prev) => (prev.length === 0 ? prev : [])), [model]);
  const sunStudyDate = useMemo<SunStudyDate | null>(
    () =>
      solar.sunStudy
        ? { lat: model.center.lat, lon: model.center.lon, year: solar.year, month: solar.month, day: solar.day }
        : null,
    [solar.sunStudy, model.center.lat, model.center.lon, solar.year, solar.month, solar.day],
  );
  const effectiveSunStudyCasters: "all" | "selected" =
    sunStudySelected.length > 0 ? "selected" : (solar.sunStudyCasters ?? "all");

  function planShadowInput(): PlanShadowInput {
    return {
      lat: model.center.lat,
      lon: model.center.lon,
      year: solar.year,
      month: solar.month,
      day: solar.day,
      hour: solar.hour,
      minute: solar.minute,
    };
  }

  function heliodonDiagramExport(): HeliodonDiagramExportOptions | null {
    if (!solar.showPath) return null;
    return {
      ...planShadowInput(),
      sideM: model.sideM,
      radiusFactor: solar.radiusFactor,
    };
  }

  function sitePlanExportOptions(): SitePlanExportOptions {
    return {
      heliodon: heliodonDiagramExport(),
      shadows: planShadowInput(),
      castShadows: solar.castShadows,
      uniformBuildings: !colourByUse && !showSourceOrReliability,
      colourBySource: showSource,
      colourByReliability: showReliability,
      highlightManual: showManualEdits && overrideResult.manualCount > 0,
      wind:
        windSettings.enabled && windTable
          ? { table: windTable, period: windSettings.period }
          : null,
    };
  }

  function commitWind(next: WindViewSettings) {
    writeStoredWindSettings(window.localStorage, next);
    setWindSettings(next);
  }

  const wantWindTable = windSettings.enabled || (sidebar.section === "analysis" && analysisKind === "wind");
  useEffect(() => {
    if (!wantWindTable) return;
    let cancelled = false;
    const lat = model.siteAnchor?.lat ?? model.center.lat;
    const lon = model.siteAnchor?.lon ?? model.center.lon;
    fetchWindRoseTable(lat, lon).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setWindTable(result.table);
        setWindNote(null);
      } else {
        setWindTable(null);
        setWindNote(result.quietNote);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wantWindTable, model.center.lat, model.center.lon, model.siteAnchor?.lat, model.siteAnchor?.lon]);

  function heliodonRhinoExport(): HeliodonGroundExportOptions | null {
    if (!solar.showPath) return null;
    return { ...heliodonDiagramExport()!, radiusFactor: solar.radiusFactor };
  }
  const exportRef = useRef<SceneExporter | null>(null);
  const onExportReady = useCallback((exporter: SceneExporter | null) => {
    exportRef.current = exporter;
  }, []);
  const onScale = useCallback((widthM: number) => setPlanWidth(widthM), []);
  useEffect(() => {
    writeStoredView(window.localStorage, loadView());
  }, []);

  useEffect(() => {
    setComFootprintFetchError((prev) => (prev === (model.comFootprintFetchError ?? null) ? prev : (model.comFootprintFetchError ?? null)));
  }, [
    model.placeLabel,
    model.center.lat,
    model.center.lon,
    model.sideM,
    model.comFootprintFetchError,
  ]);

  useEffect(() => {
    clearLegacyComBuildingHeightsPreference(window.localStorage);
  }, []);

  useEffect(() => {
    if (!model.layers.buildings) {
      setComFootprints([]);
      setComFootprintLoading(false);
      return;
    }
    if (model.comFootprintPrefetch?.length) {
      setComFootprints((prev) => (prev === model.comFootprintPrefetch ? prev : model.comFootprintPrefetch!));
      setComFootprintFetchError((prev) => (prev === null ? prev : null));
      setComFootprintLoading((prev) => (prev === false ? prev : false));
      return;
    }
    if (model.comFootprintFetchError && comFootprintRetryToken === 0) {
      setComFootprints((prev) => (prev.length === 0 ? prev : []));
      setComFootprintLoading((prev) => (prev === false ? prev : false));
      return;
    }
    const bounds = paddedComFetchBounds(model.center, model.sideM);
    if (!intersectsComCity(bounds)) {
      setComFootprints([]);
      setComFootprintLoading(false);
      return;
    }
    const controller = new AbortController();
    setComFootprintLoading(true);
    fetchComBuildingFootprints(bounds, model.center, controller.signal)
      .then((footprints) => {
        if (controller.signal.aborted) return;
        setComFootprints(footprints);
        setComFootprintLoading(false);
        if (footprints.length === 0) {
          setComFootprintFetchError(
            "City of Melbourne 2023 building footprints returned no data.",
          );
        } else {
          setComFootprintFetchError(null);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setComFootprints([]);
        setComFootprintLoading(false);
        setComFootprintFetchError(
          err instanceof Error
            ? err.message
            : "City of Melbourne 2023 building footprints could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [
    model.center.lat,
    model.center.lon,
    model.sideM,
    model.layers.buildings,
    model.comFootprintPrefetch,
    comFootprintRetryToken,
  ]);

  const comFetchBounds = useMemo(
    () => paddedComFetchBounds(model.center, model.sideM),
    [model.center.lat, model.center.lon, model.sideM],
  );
  const inComCity = intersectsComCity(comFetchBounds);
  const [comHeightBuildings, setComHeightBuildings] = useState<typeof model.buildings | null>(null);
  const comHeightsLoadFailed =
    model.layers.buildings &&
    inComCity &&
    !comFootprintLoading &&
    (comFootprintFetchError != null || comHeightsApplyFailed);
  const comHeightsStatus = comBuildingHeightsStatus({
    buildingsLayer: model.layers.buildings,
    inComCity,
    loadFailed: comHeightsLoadFailed,
    loading:
      comFootprintLoading ||
      (!comHeightsLoadFailed &&
        comFootprints.length > 0 &&
        model.buildings.length > 0 &&
        comHeightBuildings == null &&
        !model.comBuildingHeightsApplied),
  });
  const comHeightsMeasuredOn = comHeightsStatus === "on";
  const comHeightsStatusNote = comBuildingHeightsStatusNote(comHeightsStatus);
  const [heightOverrideStore, setHeightOverrideStore] = useState<HeightOverrideStore>(() =>
    readStoredHeightOverrides(window.localStorage),
  );
  const [showManualEdits, setShowManualEdits] = useState(() =>
    readStoredShowManualHeights(window.localStorage),
  );
  const [unmatchedEdits, setUnmatchedEdits] = useState(0);
  const [hiddenStore, setHiddenStore] = useState<HiddenBuildingStore>(() =>
    readStoredHiddenBuildings(window.localStorage),
  );
  /** Shift-click multi-selection for Hide selected. Holds the single pick too. */
  const [hideSelection, setHideSelection] = useState<number[]>([]);
  const [heightPick, setHeightPick] = useState<{ buildingId: number; clientX: number; clientY: number } | null>(
    null,
  );

  const massing = useImportedMassing(model);

  const qaSummaryRef = useRef({ treeCrowns: 0, buildingCount: 0, roadCount: 0, triangleCount: 0 });
  const qaDisplayBuildingsRef = useRef(model.buildings);
  const heightPerfRef = useRef<{ modelOpenMs: number; firstRenderMs: number | null; comAppliedMs: number | null }>(
    { modelOpenMs: performance.now(), firstRenderMs: null, comAppliedMs: null },
  );

  useEffect(() => {
    heightPerfRef.current = { modelOpenMs: performance.now(), firstRenderMs: null, comAppliedMs: null };
  }, [model.placeLabel, model.center.lat, model.center.lon, model.sideM]);

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    const group = buildCityGroup(model);
    let triangleCount = 0;
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const index = mesh.geometry.index;
      if (index) triangleCount += index.count / 3;
      else {
        const position = mesh.geometry.getAttribute("position");
        if (position) triangleCount += position.count / 3;
      }
    });
    const treeCrowns = countTreeCrowns(group);
    disposeObject(group);
    qaSummaryRef.current = {
      treeCrowns,
      buildingCount: model.buildings.length,
      roadCount: model.roads.length,
      triangleCount: Math.round(triangleCount),
    };
  }, [model]);

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;

    function buildingCentroid(building: (typeof model.buildings)[number]) {
      const ring = openRing(building.ring);
      let east = 0;
      let north = 0;
      for (const [e, n] of ring) {
        east += e;
        north += n;
      }
      const count = ring.length || 1;
      return { east: east / count, north: north / count };
    }

    window.__citycutQaModel = {
      getSummary: () => qaSummaryRef.current,
      listBuildings() {
        return qaDisplayBuildingsRef.current.map((building) => {
          const { east, north } = buildingCentroid(building);
          return { id: building.id, height: building.height, east, north };
        });
      },
      selectHeightEditBuilding(buildingId: number) {
        setHeightPick({ buildingId, clientX: 640, clientY: 400 });
        return buildingId;
      },
      pickForegroundBuildingForSelectionQa() {
        const candidates = model.buildings
          .filter(
            (building) =>
              building.height >= 10 &&
              building.height <= 28 &&
              building.use !== "outbuilding",
          )
          .map((building) => {
            const { east, north } = buildingCentroid(building);
            return {
              building,
              east,
              north,
              dist: Math.hypot(east, north),
            };
          })
          .filter((entry) => entry.dist >= 35 && entry.dist <= 130)
          .sort(
            (a, b) =>
              Math.abs(a.building.height - 16) - Math.abs(b.building.height - 16) ||
              a.dist - b.dist,
          );
        const pick = candidates[0]?.building;
        if (!pick) return null;
        setHeightPick({ buildingId: pick.id, clientX: 640, clientY: 400 });
        return pick.id;
      },
      clearHeightSelection() {
        setHeightPick(null);
      },
      pickTallTowerForSelectionQa() {
        const candidates = model.buildings
          .filter((building) => building.height >= 40 && building.use !== "outbuilding")
          .map((building) => {
            const { east, north } = buildingCentroid(building);
            return { building, east, north, dist: Math.hypot(east, north) };
          })
          .filter((entry) => entry.dist >= 15 && entry.dist <= 160)
          .sort((a, b) => b.building.height - a.building.height || a.dist - b.dist);
        const pick = candidates[0]?.building;
        if (!pick) return null;
        setHeightPick({ buildingId: pick.id, clientX: 24, clientY: 72 });
        return pick.id;
      },
      frameAerialSelectionBuilding(buildingId: number) {
        const row = window.__citycutQaModel?.listBuildings?.().find((item) => item.id === buildingId);
        if (!row || !window.__citycutQa?.setCamera) return false;
        const yMid = row.height * 0.45;
        const z = -row.north;
        const dist = 210;
        window.__citycutQa.setCamera({
          eye: { x: row.east - dist * 0.62, y: yMid + dist * 0.52, z: z - dist * 0.62 },
          target: { x: row.east + 12, y: Math.max(8, yMid * 0.35), z: z + 10 },
        });
        return true;
      },
      frameSelectionBuilding(buildingId: number, variant: "through" | "oblique" = "through") {
        const row = window.__citycutQaModel?.listBuildings?.().find((item) => item.id === buildingId);
        if (!row || !window.__citycutQa?.setCamera) return false;
        const y = row.height * 0.45;
        const z = -row.north;
        if (variant === "oblique") {
          window.__citycutQa.setCamera({
            eye: { x: row.east - 95, y: y + 58, z: z + 105 },
            target: { x: row.east + 8, y: y, z: z },
          });
        } else {
          window.__citycutQa.setCamera({
            eye: { x: row.east - 135, y: y + 32, z: z - 75 },
            target: { x: row.east + 45, y: y, z: z },
          });
        }
        return true;
      },
      selectionScreenClip(buildingId: number, padPx = 48) {
        const building = qaDisplayBuildingsRef.current.find((item) => item.id === buildingId);
        const project = window.__citycutQa?.projectToScreen;
        if (!building || !project) return null;
        const { east, north } = buildingCentroid(building);
        const z = -north;
        const h = building.height;
        const corners = [
          project({ x: east, y: 0, z }),
          project({ x: east, y: h, z }),
          project({ x: east - 25, y: h * 0.5, z }),
          project({ x: east + 25, y: h * 0.5, z }),
        ].filter(Boolean);
        if (corners.length === 0) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const point of corners) {
          minX = Math.min(minX, point!.x);
          minY = Math.min(minY, point!.y);
          maxX = Math.max(maxX, point!.x);
          maxY = Math.max(maxY, point!.y);
        }
        return {
          x: Math.max(0, Math.floor(minX - padPx)),
          y: Math.max(0, Math.floor(minY - padPx)),
          width: Math.ceil(maxX - minX + padPx * 2),
          height: Math.ceil(maxY - minY + padPx * 2),
        };
      },
      openMidriseHeightEdit() {
        const midriseUses: BuildingUse[] = ["commercial", "mixed_use", "retail"];
        const midrise = model.buildings
          .filter(
            (building) =>
              building.height >= 12 &&
              building.use !== "outbuilding" &&
              midriseUses.includes(building.use),
          )
          .sort((a, b) => b.height - a.height);
        const fallback = model.buildings
          .filter((building) => building.height >= 12 && building.use !== "outbuilding")
          .sort((a, b) => b.height - a.height);
        const pick = midrise[0] ?? fallback[0];
        if (!pick) return null;
        setHeightPick({ buildingId: pick.id, clientX: 72, clientY: 88 });
        return pick.id;
      },
      pickBuildingNearGeoQa(lat: number, lon: number) {
        const at = toLocal(lat, lon, model.center);
        let pick = model.buildings.find((building) => pointInPolygon(at, building.ring, building.holes));
        if (!pick) {
          let best = Infinity;
          for (const building of model.buildings) {
            const { east, north } = buildingCentroid(building);
            const dist = Math.hypot(east - at[0], north - at[1]);
            if (dist < best) {
              best = dist;
              pick = building;
            }
          }
        }
        if (!pick) return null;
        setHeightPick({ buildingId: pick.id, clientX: 640, clientY: 420 });
        return pick.id;
      },
      exportPlanSnapshot: () => model,
      pickZoneDefaultPanelQa() {
        const rows = qaDisplayBuildingsRef.current.filter((b) => b.heightFromFallback);
        const pick =
          rows.find((b) => b.zoneDefaultNote?.includes("estimate, no measured height")) ?? rows[0];
        if (!pick) return null;
        setHeightPick({ buildingId: pick.id, clientX: 480, clientY: 420 });
        return { id: pick.id, height: pick.height, note: pick.zoneDefaultNote ?? "" };
      },
      getHeightPerfTimings: () => ({ ...heightPerfRef.current }),
      waitForComHeightsApplied(timeoutMs = 120_000) {
        const start = performance.now();
        return new Promise<{ comAppliedMs: number | null; firstRenderMs: number | null }>((resolve, reject) => {
          const tick = () => {
            const timings = heightPerfRef.current;
            if (timings.comAppliedMs != null) {
              resolve({ comAppliedMs: timings.comAppliedMs, firstRenderMs: timings.firstRenderMs });
              return;
            }
            if (performance.now() - start > timeoutMs) {
              reject(new Error("Timed out waiting for CoM heights"));
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });
      },
      async captureViewportPng(): Promise<string | null> {
        const exporter = exportRef.current;
        if (!exporter) return null;
        const blob = await exporter.png();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        return btoa(binary);
      },
    };
    return () => {
      delete window.__citycutQaModel;
    };
  }, [model]);

  useEffect(() => {
    if (model.comBuildingHeightsApplied) {
      return;
    }
    if (comFootprints.length === 0 || model.buildings.length === 0) {
      setComHeightBuildings((prev) => (prev === null ? prev : null));
      return;
    }
    const controller = new AbortController();
    const source = model.buildingsWithoutCom ?? model.buildings;
    const isDomTest =
      typeof navigator !== "undefined" && /jsdom|HappyDOM/i.test(navigator.userAgent ?? "");
    const startWorker = () => {
      setComHeightsApplyFailed(false);
      runComBuildingHeightsInWorker(source, comFootprints, controller.signal, {
        center: model.center,
        damRecords: model.developmentDamRecords ?? [],
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          // CoM first, then DAM floors on what CoM did not measure, then estimate labels.
          setComHeightBuildings(
            result.resolved
              ? result.buildings
              : resolveBuildingHeightsAfterCom(
                  result.buildings,
                  model.center,
                  comFootprints,
                  model.developmentDamRecords ?? [],
                ),
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setComHeightBuildings(null);
            setComHeightsApplyFailed(true);
          }
        });
    };
    if (isDomTest) {
      startWorker();
      return () => controller.abort();
    }
    const timerId = window.setTimeout(startWorker, 6200);
    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [
    comFootprints,
    comFootprintRetryToken,
    model.buildings,
    model.buildingsWithoutCom,
    model.center,
    model.comBuildingHeightsApplied,
    model.developmentDamRecords,
  ]);

  // No CoM heights yet (loading, failed, or outside the City of Melbourne): the next source in
  // tier order applies (DAM floors, Overture/OSM, zone default) and every default is labelled.
  const fallbackBuildings = useMemo(
    () =>
      model.buildingsHeightResolved
        ? model.buildings
        : model.buildingsWithoutCom
          ? resolveBuildingHeightsAfterCom(
              model.buildingsWithoutCom,
              model.center,
              [],
              model.developmentDamRecords ?? [],
            )
          : stampPlainZoneDefaultLabels(model.buildings),
    [model.buildings, model.buildingsHeightResolved, model.buildingsWithoutCom, model.center, model.developmentDamRecords],
  );
  const annotatedAppliedBuildings = useMemo(
    () =>
      model.comBuildingHeightsApplied
        ? model.buildingsHeightResolved
          ? model.buildings
          : annotateUnresolvedZoneDefaults(
              model.buildings,
              model.center,
              comFootprints,
              model.developmentDamRecords ?? [],
            )
        : null,
    [model.comBuildingHeightsApplied, model.buildingsHeightResolved, model.buildings, model.center, comFootprints, model.developmentDamRecords],
  );
  const baseBuildings = useMemo(() => {
    if (comHeightBuildings) return comHeightBuildings;
    if (annotatedAppliedBuildings) return annotatedAppliedBuildings;
    return fallbackBuildings;
  }, [comHeightBuildings, annotatedAppliedBuildings, fallbackBuildings]);

  const overrideResult = useMemo(
    () => applyHeightOverrides(baseBuildings, heightOverrideStore, model.center),
    [baseBuildings, heightOverrideStore, model.center],
  );

  useEffect(() => {
    setUnmatchedEdits((prev) => (prev === overrideResult.unmatchedCount ? prev : overrideResult.unmatchedCount));
    clearPlanShadowCache();
  }, [overrideResult]);

  const hiddenMatch = useMemo(
    () => matchHiddenBuildings(overrideResult.buildings, hiddenStore, model.center),
    [overrideResult.buildings, hiddenStore, model.center],
  );
  const visibleBuildings = useMemo(() => {
    const unhidden = filterHiddenBuildings(overrideResult.buildings, new Set(hiddenMatch.keys()));
    if (hiddenBuildingUses.size === 0) return unhidden;
    return unhidden.filter((building) => !hiddenBuildingUses.has(building.use ?? "unclassified"));
  }, [overrideResult.buildings, hiddenMatch, hiddenBuildingUses]);

  const displayModel = useMemo(
    () => ({
      ...model,
      buildings: visibleBuildings,
      comBuildingHeights: comHeightsMeasuredOn,
      manualHeightEditCount: overrideResult.manualCount,
      sourceNote: appendManualHeightCredit(model.sourceNote, overrideResult.manualCount),
    }),
    [model, overrideResult, visibleBuildings, comHeightsMeasuredOn],
  );
  // View tab: the path resets with a new cut; compute uses the buildings as shown (edits, hides).
  const walk = useWalkViewshed(model, displayModel);
  const walkAt = useWalkPlayback(walk);

  /**
   * Drawing tab and its .ai exports: the display model (hidden buildings already gone) plus plan
   * footprints of visible imported massing. The 3D view and .3dm keep displayModel, so nothing is drawn twice.
   */
  const drawingModel = useMemo(() => {
    const buildingsVisible = isLayer3dVisible(view3dDisplay, "buildings");
    const treesVisible = isLayer3dVisible(view3dDisplay, "trees");
    const roadsVisible = isLayer3dVisible(view3dDisplay, "roads");
    const footpathsVisible = isLayer3dVisible(view3dDisplay, "footpaths");
    const railVisible = isLayer3dVisible(view3dDisplay, "rail");
    const landscapeVisible = isLayer3dVisible(view3dDisplay, "landscape");
    const waterVisible = isLayer3dVisible(view3dDisplay, "water");
    const contoursVisible = isLayer3dVisible(view3dDisplay, "contours");
    const baseBuildings = buildingsVisible
      ? massing.drawingBuildings.length
        ? [...displayModel.buildings, ...massing.drawingBuildings]
        : displayModel.buildings
      : [];
    return {
      ...displayModel,
      buildings: baseBuildings,
      trees: treesVisible ? displayModel.trees : [],
      roads: displayModel.roads.filter((r) => {
        if (r.kind === "rail") return railVisible;
        if (r.grade === "path") return footpathsVisible;
        return roadsVisible;
      }),
      tramLines: railVisible ? displayModel.tramLines : [],
      areas: displayModel.areas.filter((a) => {
        if (a.kind === "green") return landscapeVisible;
        if (a.kind === "water") return waterVisible;
        return true;
      }),
      contourLayer: contoursVisible ? displayModel.contourLayer : undefined,
      contours: contoursVisible ? displayModel.contours : false,
    };
  }, [displayModel, massing.drawingBuildings, view3dDisplay]);

  useEffect(() => {
    qaDisplayBuildingsRef.current = displayModel.buildings;
  }, [displayModel.buildings]);

  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || heightPerfRef.current.firstRenderMs != null) return;
        heightPerfRef.current.firstRenderMs = performance.now() - heightPerfRef.current.modelOpenMs;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [displayModel.buildings, displayModel.comBuildingHeights]);

  useEffect(() => {
    const comDone = Boolean(model.comBuildingHeightsApplied) || comHeightBuildings != null || comFootprints.length === 0;
    if (comDone && heightPerfRef.current.comAppliedMs == null) {
      heightPerfRef.current.comAppliedMs = performance.now() - heightPerfRef.current.modelOpenMs;
    }
  }, [comHeightBuildings, comFootprints.length]);

  const viewportModelKeyRef = useRef(`${displayModel.sideM}:${displayModel.frameShape ?? "square"}`);
  useEffect(() => {
    const nextViewportKey = `${displayModel.sideM}:${displayModel.frameShape ?? "square"}`;
    if (viewportModelKeyRef.current === nextViewportKey) return;
    viewportModelKeyRef.current = nextViewportKey;
    setPlanViewport(planViewportExtent(displayModel.sideM));
    setAxoSettings((prev) => {
      const defaults = defaultExplodedAxoSettings(displayModel.sideM);
      return {
        ...defaults,
        layerOrder: prev.layerOrder,
        layerVisible: { ...defaults.layerVisible, ...prev.layerVisible },
        gapM: defaultExplodedAxoGapM(displayModel.sideM),
        showLabels: prev.showLabels,
        ...(prev.terrainExaggeration != null ? { terrainExaggeration: prev.terrainExaggeration } : {}),
        ...(prev.extraGapAboveM?.buildings != null
          ? { extraGapAboveM: { buildings: defaultExplodedAxoGapM(displayModel.sideM) * AXO_REFERENCE_BUILDING_GAP_FACTOR } }
          : {}),
      };
    });
    setExplodedViewport(
      explodedAxoViewportExtent(explodedAxoBounds(displayModel, defaultExplodedAxoSettings(displayModel.sideM))),
    );
  }, [displayModel.sideM, displayModel.frameShape]);

  useEffect(() => {
    if (!qaModeFromSearch(window.location.search)) return;
    const qa = model.siteBuildingQa;
    if (!qa) {
      delete window.__citycutQaSite;
      return;
    }
    window.__citycutQaSite = {
      parcelPfi: model.siteParcelPfi,
      parcelSpi: model.siteParcelSpi,
      siteBuildingIds: model.siteBuildingIds ?? [],
      overlaps: qa.map((row) => ({
        id: row.id,
        overlapPercent: Math.round(row.overlapFraction * 1000) / 10,
        selected: row.selected,
      })),
    };
    return () => {
      delete window.__citycutQaSite;
    };
  }, [model]);

  const pickedBuilding =
    heightPick === null
      ? null
      : (displayModel.buildings.find((building) => building.id === heightPick.buildingId) ?? null);

  function persistHidden(next: HiddenBuildingStore) {
    setHiddenStore(next);
    writeStoredHiddenBuildings(window.localStorage, next);
  }

  function hideSelectedBuildings() {
    const ids = new Set(hideSelection.length ? hideSelection : heightPick ? [heightPick.buildingId] : []);
    const picked = overrideResult.buildings.filter((building) => ids.has(building.id));
    if (picked.length === 0) return;
    persistHidden(hideBuildings(hiddenStore, picked, model.center));
    setHideSelection([]);
    setHeightPick(null);
  }

  function selectForHide(buildingId: number, additive?: boolean) {
    setHideSelection((prev) => {
      if (!additive) return [buildingId];
      return prev.includes(buildingId) ? prev.filter((id) => id !== buildingId) : [...prev, buildingId];
    });
  }

  function persistOverrides(next: HeightOverrideStore) {
    setHeightOverrideStore(next);
    writeStoredHeightOverrides(window.localStorage, next);
  }

  function saveBuildingHeight(buildingId: number, heightM: number) {
    const building = baseBuildings.find((item) => item.id === buildingId);
    if (!building) return;
    persistOverrides(upsertOverrideForBuilding(heightOverrideStore, building, model.center, heightM));
    setHeightPick(null);
  }

  function resetBuildingHeight(buildingId: number) {
    const building = baseBuildings.find((item) => item.id === buildingId);
    if (!building) return;
    persistOverrides(removeOverrideForBuilding(heightOverrideStore, building, model.center));
    setHeightPick(null);
  }

  function resetAllHeights() {
    if (!window.confirm("Reset every manual building height in storage?")) return;
    persistOverrides(clearAllHeightOverrides());
    setHeightPick(null);
  }

  function exportHeightEdits() {
    const blob = new Blob([exportHeightOverridesJson(heightOverrideStore)], { type: "application/json" });
    downloadBlob("citycut-building-heights.json", blob);
  }

  async function importHeightEdits(file: File) {
    try {
      const raw = await file.text();
      const incoming = importHeightOverridesJson(raw);
      persistOverrides(mergeHeightOverrideStores(heightOverrideStore, incoming));
    } catch {
      setExportError("The height edits file could not be read.");
    }
  }
  const crs = mgaCrs(model.center.lon);
  const tierCounts = treeTierCounts(model.trees);
  const showBuildings = model.layers.buildings && model.buildings.length > 0;
  // A failed tree source must stay visible even when it leaves the frame with no trees.
  const showTrees = model.layers.trees && (model.trees.length > 0 || (model.treeLoadNotes?.length ?? 0) > 0);
  const layerBits = [
    model.layers.buildings ? "buildings" : null,
    model.layers.roads ? "roads and rail" : null,
    model.layers.waterGreen ? "water and green" : null,
    model.layers.trees ? "trees" : null,
    model.terrain ? "terrain" : null,
  ].filter(Boolean);

  const sectionIds = availableSidebarSections({ buildings: showBuildings, trees: showTrees });
  const leftSectionIds = sectionIds.filter((id) => !isRightSidebarSection(id) && id !== "exports");
  const rightSectionIds = sectionIds.filter((id) => isRightSidebarSection(id));
  const items: SidebarItem[] = leftSectionIds.map((id) => {
    const Icon = SECTION_ICONS[id];
    return {
      id,
      label: SIDEBAR_SECTION_LABELS[id],
      icon: <Icon {...iconProps} />,
      groupStart: id === "import",
    };
  });
  const rightItems: SidebarItem[] = rightSectionIds.map((id, index) => {
    const Icon = SECTION_ICONS[id];
    return {
      id,
      label: SIDEBAR_SECTION_LABELS[id],
      icon: <Icon {...iconProps} />,
      groupStart: index === 1,
    };
  });
  const leftOpen: LeftSidebarSectionId = resolveLeftSidebarSection(sidebar.section, sectionIds);
  const rightOpen: RightSidebarSectionId = resolveRightSidebarSection(sidebar.rightSection, sectionIds);
  const viewAnalysisOpen = leftOpen === "analysis" && analysisKind === "view";
  const walkDrawing = viewAnalysisOpen && walk.drawing;
  const { drawing: walkDrawingOn, setDrawing: setWalkDrawing } = walk;
  useEffect(() => {
    if (!viewAnalysisOpen && walkDrawingOn) setWalkDrawing(false);
  }, [viewAnalysisOpen, walkDrawingOn, setWalkDrawing]);

  const [consolePlaying, setConsolePlaying] = useState(false);
  const consoleDaylight = useMemo(
    () =>
      daylightWindowMinutes(
        model.center.lat,
        model.center.lon,
        solar.year,
        solar.month,
        solar.day,
      ) ?? { sunrise: 360, sunset: 1080 },
    [model.center.lat, model.center.lon, solar.year, solar.month, solar.day],
  );
  const consoleSun = useMemo(
    () =>
      sunAtMelbourneLocal(
        model.center.lat,
        model.center.lon,
        solar.year,
        solar.month,
        solar.day,
        solar.hour,
        solar.minute,
      ),
    [model.center.lat, model.center.lon, solar.year, solar.month, solar.day, solar.hour, solar.minute],
  );
  const consoleWindStats = useMemo(
    () => (windTable ? analyzeWindPeriod(windTable, windSettings.period) : null),
    [windTable, windSettings.period],
  );

  useEffect(() => {
    if (!consolePlaying) return;
    let raf = 0;
    let last = performance.now();
    let minutesFloat = solar.hour * 60 + solar.minute;
    const minM = consoleDaylight.sunrise;
    const maxM = consoleDaylight.sunset;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      minutesFloat += dt * 72;
      if (minutesFloat > maxM) minutesFloat = minM;
      const rounded = Math.round(minutesFloat);
      const hour = Math.floor(rounded / 60);
      const minute = rounded % 60;
      setSolar((prev) => ({ ...prev, hour, minute, castShadows: true }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [consolePlaying, consoleDaylight.sunrise, consoleDaylight.sunset]);

  function selectSection(id: string) {
    if (id === "solar" || id === "wind" || id === "view") setAnalysisKind(id);
    const resolved = isRightSidebarSection(id)
      ? resolveRightSidebarSection(id, sectionIds)
      : resolveSidebarSection(id, sectionIds);
    dispatchSidebar({ type: "select", id: resolved });
    if (!isRightSidebarSection(resolved)) {
      setSidebarCollapsed(false);
    }
  }

  function retryComHeights() {
    setComFootprintFetchError(null);
    setComHeightsApplyFailed(false);
    setComFootprintRetryToken((token) => token + 1);
  }

  function commitView3dDisplay(next: View3dDisplaySettings) {
    setView3dDisplay(next);
    writeStoredView3dDisplay(window.localStorage, next);
  }

  function pickBuildingUseColour(use: BuildingUse, value: string) {
    commitColour(BUILDING_USE_META[use].key, value);
    if (!colourByUse || showSource) {
      pickSourceStyle(false);
      setColourByUse(true);
    }
    if (view3dDisplay.whiteCard || !isLayer3dVisible(view3dDisplay, "buildings")) {
      commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, whiteCard: false }, "buildings", true));
    }
    setHiddenBuildingUses((prev) => {
      if (!prev.has(use)) return prev;
      const next = new Set(prev);
      next.delete(use);
      return next;
    });
    setLineStyles(readDrawingStyle());
  }

  function resetSceneLayerColours() {
    resetStoredColours(undefined, () => {
      if (typeof window !== "undefined") {
        applyOverrides(readStoredOverrides(window.localStorage));
      }
    });
    setLineStyles(readDrawingStyle());
  }

  function commitView(next: ViewMemory, snap: boolean) {
    setView(next);
    writeStoredView(window.localStorage, next);
    const search = writeViewSearch(window.location.search, next);
    const nextUrl = `${window.location.pathname}${search}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== current) window.history.replaceState(window.history.state, "", nextUrl);
    if (snap) setSnapId((id) => id + 1);
  }

  async function save3dm() {
    setExportError(null);
    setBusy("3dm");
    try {
      await download3dm(displayModel, {
        heliodon: heliodonRhinoExport(),
        shadows: planShadowInput(),
        castShadows: solar.castShadows,
        uniformBuildings: !colourByUse && !showSourceOrReliability,
        colourBySource: showSource,
        colourByReliability: showReliability,
        wind:
          windSettings.enabled && windTable
            ? { table: windTable, period: windSettings.period }
            : null,
        hideTrees: view3dDisplay.hideTrees,
        importedMassing: massing.forExport.length ? massing.forExport : null,
        buildingsAsMesh,
      });
    } catch {
      setExportError("The Rhino file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  /** Sun study on: the seven hourly layers for the site plan exports (from the screen's cache). */
  async function sunStudyExportLayers(): Promise<SitePlanExportOptions["sunStudy"]> {
    if (!sunStudyDate) return null;
    const casters = sunStudyCasterModel(drawingModel, effectiveSunStudyCasters, sunStudySelected);
    return { layers: await sunStudyLayersFor(casters, sunStudyDate) };
  }

  async function saveSiteSvg() {
    setExportError(null);
    setBusy("svg-site");
    try {
      await downloadSiteSvg(drawingModel, figureScale, lineStyles, {
        ...sitePlanExportOptions(),
        sunStudy: await sunStudyExportLayers(),
      });
    } catch {
      setExportError("The site plan SVG could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function saveFigureSvg() {
    setExportError(null);
    setBusy("svg-figure");
    try {
      await downloadFigureSvg(drawingModel, figureScale, lineStyles, heliodonDiagramExport());
    } catch {
      setExportError("The figure-ground SVG could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSiteAi() {
    setExportError(null);
    setBusy("ai-site");
    try {
      await downloadSiteAi(drawingModel, figureScale, lineStyles, {
        ...sitePlanExportOptions(),
        sunStudy: await sunStudyExportLayers(),
      });
    } catch {
      setExportError("The site plan could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSunStudyAi() {
    setExportError(null);
    setBusy("ai-sun");
    setSunStudyProgress("0 of 7");
    try {
      const date = { year: solar.year, month: solar.month, day: solar.day };
      const problem = await downloadSunStudyZip(
        drawingModel,
        figureScale,
        lineStyles,
        (hour) => ({
          ...sitePlanExportOptions(),
          heliodon: null,
          shadows: { ...planShadowInput(), hour, minute: 0 },
          castShadows: true,
        }),
        date,
        (done, total) => setSunStudyProgress(`${done} of ${total}`),
      );
      if (problem) setExportError(problem);
    } catch {
      setExportError("The sun study could not be written.");
    } finally {
      setSunStudyProgress(null);
      setBusy(null);
    }
  }

  async function saveFigureAi() {
    setExportError(null);
    setBusy("ai-figure");
    try {
      await downloadFigureAi(drawingModel, figureScale, lineStyles, heliodonDiagramExport());
    } catch {
      setExportError("The figure-ground file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function saveExplodedAxoAi() {
    setExportError(null);
    setBusy("ai-exploded");
    try {
      await downloadExplodedAxoAi(drawingModel, figureScale, axoSettings);
    } catch {
      setExportError("The exploded axo file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function saveIsometricAi() {
    setExportError(null);
    setBusy("ai-isometric");
    try {
      await downloadIsometricAi(drawingModel, figureScale, {
        corner: view.corner,
        display: view3dDisplay,
      });
    } catch {
      setExportError("The isometric file could not be written.");
    } finally {
      setBusy(null);
    }
  }

  async function saveIsometricSvg() {
    setExportError(null);
    setBusy("svg-isometric");
    try {
      await downloadIsometricSvg(drawingModel, figureScale, {
        corner: view.corner,
        display: view3dDisplay,
      });
    } catch {
      setExportError("The isometric SVG could not be written.");
    } finally {
      setBusy(null);
    }
  }

  const draggedAxoLayer = useRef<AxoLayerId | null>(null);

  function dragReorderAxoLayer(from: AxoLayerId, to: AxoLayerId) {
    setAxoSettings((prev) => {
      const order = reorderAxoLayer(prev.layerOrder, from, to);
      if (order.every((id, i) => id === prev.layerOrder[i])) return prev;
      const { layerLiftM: _cleared, ...rest } = prev;
      return { ...rest, layerOrder: order };
    });
  }

  function setAxoLayerLift(id: AxoLayerId, liftM: number) {
    setAxoSettings((prev) => {
      const base = liftsForLayerOrder(prev.layerOrder, prev.gapM, prev.extraGapAboveM, prev.layerLiftM);
      base.set(id, Math.round(liftM));
      const layerLiftM = Object.fromEntries(base.entries()) as Partial<Record<AxoLayerId, number>>;
      const layerOrder = [...prev.layerOrder].sort((a, b) => (base.get(b) ?? 0) - (base.get(a) ?? 0));
      return { ...prev, layerOrder, layerLiftM };
    });
  }

  async function savePng() {
    setExportError(null);
    setBusy("png");
    try {
      const exporter = exportRef.current;
      if (!exporter) throw new Error("The 3D view is not ready.");
      const blob = await exporter.png();
      downloadBlob(pngFilename(model), blob);
    } catch {
      setExportError("The PNG image could not be written.");
    } finally {
      setBusy(null);
    }
  }

  const figureFit = sheetFitMessage(model.sideM, figureScale);
  const useCounts = countUses(model.buildings);
  const sourceCounts = countSourcesGrouped(displayModel.buildings);
  const heightTierCounts = countBuildingHeightTiers(displayModel.buildings);
  const comMeasuredHeightCount = useMemo(
    () => countBuildingsWithComHeightTier(displayModel.buildings),
    [displayModel.buildings],
  );
  const lidarTierNote = model.lidarHeightTierNote ?? LIDAR_NO_DATA_LINE;
  const heightTierLegend: { tier: keyof typeof heightTierCounts; label: string }[] = [
    { tier: "com", label: heightTierLabel("com") },
    { tier: "lidar", label: "LiDAR (Vicmap, licensed)" },
    { tier: "overture_height", label: heightTierLabel("overture_height") },
    { tier: "overture_floors", label: heightTierLabel("overture_floors") },
    { tier: "development_floors", label: heightTierLabel("development_floors") },
    { tier: "osm_levels", label: heightTierLabel("osm_levels") },
    { tier: "zone_default", label: heightTierLabel("zone_default") },
    { tier: "real_source_unmatched", label: heightTierLabel("real_source_unmatched") },
    { tier: "manual", label: heightTierLabel("manual") },
  ];
  const dataSources = buildDataSources({
    model,
    comHeights: comHeightsStatus,
    comMeasuredCount: comMeasuredHeightCount,
    comError: comFootprintFetchError ?? (comHeightsApplyFailed ? "The height matcher failed." : null),
  });
  const sourcesLoaded = countLoaded(dataSources);
  const heightBarParts = [
    { id: "measured", label: "Measured", value: comMeasuredHeightCount },
    { id: "lidar", label: "LiDAR", value: heightTierCounts.lidar },
    {
      id: "overture",
      label: "Overture",
      value: heightTierCounts.overture_height + heightTierCounts.overture_floors + heightTierCounts.osm_levels,
    },
    { id: "floors", label: "Dev. floors", value: heightTierCounts.development_floors },
    { id: "estimate", label: "Estimated", value: heightTierCounts.zone_default + heightTierCounts.real_source_unmatched },
    { id: "manual", label: "Manual", value: heightTierCounts.manual },
  ];
  const heightBar = {
    parts: heightBarParts,
    measured: comMeasuredHeightCount,
    total: heightBarParts.reduce((sum, part) => sum + part.value, 0),
  };

  const presentBuildingUses = showBuildings
    ? BUILDING_USES.filter((use) => useCounts[use] > 0)
    : [];

  const availableLayers3d: {
    id: Layer3dId;
    label: string;
    meta: string;
    color: string;
    available: boolean;
    onPick: (value: string) => void;
  }[] = (
    [
      {
        id: "trees" as const,
        label: "Trees",
        meta: model.trees.length.toLocaleString(),
        color: getColour("--tree-crown"),
        available: model.layers.trees && model.trees.length > 0,
        onPick: (value: string) => {
          commitColour("--tree-crown", value);
          commitColour("--tree-crown-edge", value);
          commitColour("--tree-fill", value);
          commitColour("--tree-layer", value);
          if (view3dDisplay.whiteCard || !isLayer3dVisible(view3dDisplay, "trees")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, whiteCard: false }, "trees", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "roads" as const,
        label: "Roads",
        meta: `${formatLengthKm(model.roadKm)} km`,
        color: getColour("--road-local"),
        available: model.layers.roads && model.roads.some((r) => r.kind === "road" && r.grade !== "path"),
        onPick: (value: string) => {
          commitColour("--road-local", value);
          commitColour("--road-arterial", value);
          commitColour("--road-fill", value);
          if (view3dDisplay.whiteCard || !isLayer3dVisible(view3dDisplay, "roads")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, whiteCard: false }, "roads", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "footpaths" as const,
        label: "Footpaths",
        meta: model.roads.filter((r) => r.kind === "road" && r.grade === "path").length.toLocaleString(),
        color: getColour("--road-path"),
        available: model.layers.roads && model.roads.some((r) => r.kind === "road" && r.grade === "path"),
        onPick: (value: string) => {
          commitColour("--road-path", value);
          commitColour("--path-fill", value);
          if (view3dDisplay.whiteCard || !isLayer3dVisible(view3dDisplay, "footpaths")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, whiteCard: false }, "footpaths", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "landscape" as const,
        label: "Landscape",
        meta: `${model.areas.filter((a) => a.kind === "green").length.toLocaleString()} zones`,
        color: getColour("--green-3d"),
        available: model.layers.waterGreen && model.areas.some((a) => a.kind === "green"),
        onPick: (value: string) => {
          commitColour("--green-3d", value);
          commitColour("--green-fill", value);
          if (view3dDisplay.whiteCard || !isLayer3dVisible(view3dDisplay, "landscape")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, whiteCard: false }, "landscape", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "water" as const,
        label: "Water",
        meta: `${model.areas.filter((a) => a.kind === "water").length.toLocaleString()} zones`,
        color: getColour("--water-3d"),
        available: model.layers.waterGreen && model.areas.some((a) => a.kind === "water"),
        onPick: (value: string) => {
          commitColour("--water-3d", value);
          commitColour("--water-fill", value);
          if (view3dDisplay.whiteCard || !isLayer3dVisible(view3dDisplay, "water")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, whiteCard: false }, "water", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "rail" as const,
        label: "Rail & tram",
        meta: `${model.roads.filter((r) => r.kind === "rail").length + (model.tramLines?.length ?? 0)} lines`,
        color: getColour("--rail-fill"),
        available:
          model.layers.roads &&
          (model.roads.some((r) => r.kind === "rail") || (model.tramLines?.length ?? 0) > 0),
        onPick: (value: string) => {
          commitColour("--rail-fill", value);
          commitColour("--outline-rail", value);
          commitColour("--tram-line-stroke", value);
          commitColour("--outline-tram", value);
          if (!isLayer3dVisible(view3dDisplay, "rail")) {
            commitView3dDisplay(setLayer3dVisible(view3dDisplay, "rail", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "contours" as const,
        label: "Contours",
        meta: model.contourLayer ? `${model.contourLayer.interval} m` : "",
        color: getColour("--outline-contour"),
        available: Boolean(model.contourLayer && model.contourLayer.lines.length > 0),
        onPick: (value: string) => {
          commitColour("--outline-contour", value);
          if (!isLayer3dVisible(view3dDisplay, "contours")) {
            commitView3dDisplay(setLayer3dVisible(view3dDisplay, "contours", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
    ]
  ).filter((layer) => layer.available);

  const sceneLayerRows: {
    id: string;
    label: string;
    meta: string;
    color: string;
    visible: boolean;
    onToggle: (checked: boolean) => void;
    onPick: (value: string) => void;
  }[] = [
    ...presentBuildingUses.map((use) => ({
      id: `use:${use}`,
      label: BUILDING_USE_META[use].label,
      meta: useCounts[use].toLocaleString(),
      color: BUILDING_USE_META[use].color,
      visible: isLayer3dVisible(view3dDisplay, "buildings") && !hiddenBuildingUses.has(use),
      onToggle: (checked: boolean) => {
        setHiddenBuildingUses((prev) => {
          const next = new Set(prev);
          if (checked) {
            next.delete(use);
          } else {
            next.add(use);
          }
          return next;
        });
        if (checked && !isLayer3dVisible(view3dDisplay, "buildings")) {
          commitView3dDisplay(setLayer3dVisible(view3dDisplay, "buildings", true));
        }
      },
      onPick: (value: string) => pickBuildingUseColour(use, value),
    })),
    ...availableLayers3d.map((layer) => ({
      id: layer.id,
      label: layer.label,
      meta: layer.meta,
      color: layer.color,
      visible: isLayer3dVisible(view3dDisplay, layer.id),
      onToggle: (checked: boolean) =>
        commitView3dDisplay(setLayer3dVisible(view3dDisplay, layer.id, checked)),
      onPick: layer.onPick,
    })),
  ];

  const modelRootRef = useRef<HTMLDivElement | null>(null);
  const introHoldReleasedRef = useRef(false);
  const introWebglReadyRef = useRef(false);
  useEffect(() => {
    const el = modelRootRef.current;
    if (!el) return;
    const release = () => {
      introHoldReleasedRef.current = true;
      el.removeAttribute("data-intro-hold");
    };
    const revealModel = () => {
      introWebglReadyRef.current = true;
      el.removeAttribute("data-intro-webgl-wait");
    };
    const onWebglReady = () => {
      if (typeof window === "undefined" || !window.__citycutAwaitIntroStart || window.__citycutIntroStarted) {
        revealModel();
      }
    };
    if (tab !== "3d" || !shouldShowIntroBridgePill()) {
      release();
      revealModel();
      return;
    }
    if (typeof window !== "undefined" && window.__citycutIntroStarted) {
      revealModel();
    }
    el.addEventListener("citycut:intro-hold-release", release);
    window.addEventListener("citycut:intro-webgl-ready", onWebglReady);
    window.addEventListener("citycut:intro-start", revealModel);
    const timer = window.setTimeout(release, 45000);
    const webglTimer = window.setTimeout(revealModel, 25000);
    return () => {
      el.removeEventListener("citycut:intro-hold-release", release);
      window.removeEventListener("citycut:intro-webgl-ready", onWebglReady);
      window.removeEventListener("citycut:intro-start", revealModel);
      window.clearTimeout(timer);
      window.clearTimeout(webglTimer);
    };
  }, [tab]);

  return (
    <div
      ref={modelRootRef}
      className="model"
      data-intro-hold={!introHoldReleasedRef.current && tab === "3d" && shouldShowIntroBridgePill() ? "true" : undefined}
      data-intro-webgl-wait={!introWebglReadyRef.current && tab === "3d" && shouldShowIntroBridgePill() ? "true" : undefined}
    >
      <h1 className="sr-only">Your model is ready.</h1>
      <div
        className={`${
          tab === "drawing" ? "viewport is-drawing" : tab === "satellite" ? "viewport is-satellite" : "viewport"
        }${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      >
        {tab === "3d" && (
          <div className="fill">
            {shouldShowIntroBridgePill() && (() => {
              const samples = typeof window !== "undefined" ? window.__citycutProgressSamples : undefined;
              const currentPct = Array.isArray(samples) && samples.length > 0 ? (samples[samples.length - 1] ?? 0) : 0;
              return (
                <div className="loading-card loading-hud-pill is-model-bridge hud-card" aria-hidden="true" data-progress-pct={currentPct}>
                  <div className="loading-hud-row">
                    <span className="loading-pulse-dot" />
                    <strong>Building 3D site cut · LiDAR + Vicmap…</strong>
                    <div className="loading-prog-track">
                      <div className="loading-prog-fill" style={{ width: `${currentPct}%` }} />
                    </div>
                    <span className="loading-prog-pct">{currentPct}%</span>
                  </div>
                </div>
              );
            })()}
            {model.heightSourceLoadWarnings?.map((line) => (
              <p key={line} className="height-source-notice" role="status">
                {line}
              </p>
            ))}
            <SceneBoundary>
              <Scene3D
                model={displayModel}
                uniformBuildings={!colourByUse && !showSourceOrReliability}
                colourBySource={showSource}
                colourByReliability={showReliability}
                showManualEdits={showManualEdits}
                projection={view.projection}
                corner={view.corner}
                freeRotate={view.freeRotate}
                snapId={snapId}
                solar={solar}
                windEnabled={windSettings.enabled}
                windTable={windTable}
                windPeriod={windSettings.period}
                windAnimateStreaks={windMotion.animateStreaks}
                onExportReady={onExportReady}
                onBuildingPick={(buildingId, clientX, clientY, additive) => {
                  setHeightPick({ buildingId, clientX, clientY });
                  selectForHide(buildingId, additive);
                }}
                onClearBuildingPick={() => {
                  setHeightPick(null);
                  setHideSelection([]);
                }}
                heightEditBuildingId={heightPick?.buildingId ?? null}
                selectedBuildingIds={hideSelection.length > 0 ? hideSelection : heightPick ? [heightPick.buildingId] : []}
                cameraMemory={cameraMemory}
                display={view3dDisplay}
                importedMassing={massing.group}
                walkLayer={walk.layer.root}
                onScenePoint={walkDrawing ? walk.addPoint : massing.onScenePoint}
              />
              {viewAnalysisOpen && walk.clickCount > 0 && <ViewLegend />}
              {windSettings.enabled && windSettings.showRose && windTable && tab === "3d" && (
                <WindRoseOverlay
                  table={windTable}
                  period={windSettings.period}
                  streaksPaused={windMotion.streaksPaused}
                  animateAnyway={windMotion.animateAnyway}
                  onAnimateAnyway={windMotion.setAnimateAnyway}
                />
              )}
              {pickedBuilding &&
                heightPick &&
                !qaHideHeightPopoverFromSearch(window.location.search) && (
                <BuildingHeightPopover
                  building={pickedBuilding}
                  center={displayModel.center}
                  allBuildings={displayModel.buildings}
                  damRecords={displayModel.developmentDamRecords ?? []}
                  onSave={(heightM) => saveBuildingHeight(pickedBuilding.id, heightM)}
                  onReset={() => resetBuildingHeight(pickedBuilding.id)}
                  onClose={() => {
                    setHeightPick(null);
                    setHideSelection([]);
                  }}
                  selectedCount={Math.max(1, hideSelection.length)}
                  hiddenCount={hiddenMatch.size}
                  onHideSelected={hideSelectedBuildings}
                  onShowAll={() => persistHidden(showAllInCut(hiddenStore, hiddenMatch.values()))}
                />
              )}
            </SceneBoundary>
          </div>
        )}
        {tab === "drawing" && (
          <div className="fill is-plan">
            {drawing === "exploded-axo" ? (
              <DrawingExplodedAxo
                model={drawingModel}
                settings={axoSettings}
                onScale={onScale}
                viewport={explodedViewport}
                onViewportChange={setExplodedViewport}
                onLayerLiftChange={setAxoLayerLift}
                fitCounter={fitCounter}
              />
            ) : drawing === "isometric" ? (
              <DrawingIsometric
                model={drawingModel}
                corner={view.corner}
                display={view3dDisplay}
                planScale={figureScale}
                onScale={onScale}
                viewport={isoDrawingViewport}
                onViewportChange={setIsoDrawingViewport}
                fitCounter={fitCounter}
              />
            ) : (
              <DrawingPlan
                model={drawingModel}
                kind={drawing}
                onScale={onScale}
                lineStyle={lineStyles}
                planScale={figureScale}
                heliodon={
                  sunStudyDate
                    ? (heliodonDiagramExport() ?? { ...planShadowInput(), sideM: model.sideM, radiusFactor: solar.radiusFactor })
                    : heliodonDiagramExport()
                }
                castShadows={solar.castShadows}
                shadowInput={planShadowInput()}
                sunStudy={sunStudyDate}
                sunStudyMuted={sunStudyMutedOn(solar.sunStudy, solar.sunStudyMuted)}
                sunStudyCasters={effectiveSunStudyCasters}
                sunStudySelected={sunStudySelected}
                onSunStudyPick={(id) =>
                  setSunStudySelected((current) => {
                    const next = toggleSelection(current, id);
                    setSolar((prev) => ({
                      ...prev,
                      sunStudyCasters: next.length > 0 ? "selected" : "all",
                    }));
                    return next;
                  })
                }
                uniformBuildings={!colourByUse && !showSourceOrReliability}
                colourBySource={showSource}
                colourByReliability={showReliability}
                highlightManual={showManualEdits && overrideResult.manualCount > 0}
                viewport={planViewport}
                onViewportChange={setPlanViewport}
                fitCounter={fitCounter}
              />
            )}
          </div>
        )}
        {tab === "satellite" && (
          <div className="fill">
            <SatellitePane model={displayModel} viewport={planViewport} onViewportChange={setPlanViewport} />
          </div>
        )}
        <div className="sidebar-host">
          <Sidebar
            id={SIDEBAR_PANEL_ID}
            rightId={RIGHT_SIDEBAR_PANEL_ID}
            items={items}
            rightItems={rightItems}
            active={leftOpen}
            rightActive={rightOpen}
            collapsed={sidebarCollapsed}
            title={SIDEBAR_SECTION_LABELS[leftOpen]}
            rightTitle={SIDEBAR_SECTION_LABELS[rightOpen]}
            onHome={onHome}
            onNewCut={onNewCut}
            showNewCut
            onSelect={selectSection}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            rightMeta={`MGA${mgaCrs(model.center.lon).zone}`}
            brandMeta={
              <>
                <span className="v-sep hud-sep" aria-hidden="true" />
                <span className="place-chip studio-breadcrumb-place" title={model.placeLabel}>
                  {model.placeLabel}
                </span>
                <span className="dim-chip studio-cut-pill mono">
                  {cutSizeLabel(model.sideM, model.frameShape ?? "square")}
                </span>
              </>
            }
            headerCenter={
              <>
                <div className="tabs mode-group studio-view-tabs" role="tablist" aria-label="Model views">
                  {(
                    [
                      ["3d", "3D model"],
                      ["drawing", "Drawing"],
                      ["satellite", "Satellite"],
                    ] as const
                  ).map(([id, label], index) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      data-autofocus={index === 0 ? "true" : undefined}
                      aria-selected={tab === id}
                      className={tab === id ? "mode-btn active" : "mode-btn"}
                      onClick={() => setTab(id)}
                    >
                      {id === "3d" && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                      )}
                      {id === "drawing" && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                      )}
                      {id === "satellite" && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      )}
                      {label}
                    </button>
                  ))}
                </div>
                <span className="v-sep" aria-hidden="true" />
                {tab === "3d" ? (
                  <div className="proj-group studio-submode-pills" role="group" aria-label="3D projection">
                    <button
                      type="button"
                      className={view.projection === "perspective" ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                      aria-pressed={view.projection === "perspective"}
                      onClick={() => commitView({ ...view, projection: "perspective" }, false)}
                    >
                      Perspective
                    </button>
                    <button
                      type="button"
                      className={view.projection === "iso" ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                      aria-pressed={view.projection === "iso"}
                      onClick={() => commitView({ ...view, projection: "iso" }, false)}
                    >
                      Isometric
                    </button>
                    <button
                      type="button"
                      className={view.projection === "plan" ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                      aria-pressed={view.projection === "plan"}
                      onClick={() => commitView({ projection: "plan", corner: view.corner, freeRotate: false }, true)}
                    >
                      Plan
                    </button>
                  </div>
                ) : (
                  <div className="proj-group studio-submode-pills" aria-label="Quick drawing modes">
                    {(
                      [
                        ["site", "Site plan"],
                        ["figure-ground", "Figure-ground"],
                        ["exploded-axo", "Exploded axo"],
                        ["isometric", "Isometric"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        className={tab === "drawing" && drawing === kind ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                        aria-label={`Quick ${label}`}
                        aria-pressed={tab === "drawing" && drawing === kind}
                        onClick={() => {
                          setDrawing(kind);
                          setTab("drawing");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="v-sep" aria-hidden="true" />
                <button
                  type="button"
                  className="cam-reset studio-reset-btn"
                  onClick={() => {
                    if (tab === "3d") {
                      setSnapId((id) => id + 1);
                    } else if (tab === "drawing" && drawing === "exploded-axo") {
                      setExplodedViewport(
                        explodedAxoViewportExtent(explodedAxoBounds(displayModel, axoSettings)),
                      );
                      setFitCounter((token) => token + 1);
                    } else if (tab === "drawing" && drawing === "isometric") {
                      setIsoDrawingViewport(
                        explodedAxoViewportExtent(isometricDrawingBounds(displayModel, view.corner)),
                      );
                      setFitCounter((token) => token + 1);
                    } else {
                      setPlanViewport(planViewportExtent(displayModel.sideM));
                      setFitCounter((token) => token + 1);
                    }
                  }}
                >
                  Reset view
                </button>
              </>
            }
            headerRight={
              <>
                <span className="ready-dot status-dot is-ready" aria-hidden="true" />
                <span className="ready-text studio-status-pill mono">
                  Ready · {sourcesLoaded.loaded}/{sourcesLoaded.total} sources
                </span>
                <span className="v-sep" aria-hidden="true" />
                <div className="studio-quick-exports">
                  {tab === "drawing" ? (
                    <>
                      <button
                        type="button"
                        className="btn-export-3dm studio-export-btn is-primary"
                        aria-label="Quick export Adobe Illustrator .ai"
                        disabled={busy !== null}
                        onClick={() => {
                          if (drawing === "site") void saveSiteAi();
                          else if (drawing === "figure-ground") void saveFigureAi();
                          else if (drawing === "isometric") void saveIsometricAi();
                          else void saveExplodedAxoAi();
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        .ai
                      </button>
                      <button
                        type="button"
                        className="btn-export-png studio-export-btn"
                        aria-label="Quick export SVG"
                        disabled={busy !== null || drawing === "exploded-axo"}
                        onClick={() => {
                          if (drawing === "figure-ground") void saveFigureSvg();
                          else if (drawing === "isometric") void saveIsometricSvg();
                          else void saveSiteSvg();
                        }}
                      >
                        .svg
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-export-3dm studio-export-btn is-primary"
                        aria-label="Quick export Rhino .3dm"
                        disabled={busy !== null}
                        onClick={() => void save3dm()}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Rhino .3dm
                      </button>
                      <button
                        type="button"
                        className="btn-export-png studio-export-btn"
                        aria-label="Quick export 2x PNG"
                        disabled={busy !== null}
                        onClick={() => void savePng()}
                      >
                        2× PNG
                      </button>
                    </>
                  )}
                </div>
              </>
            }
            status={
              leftOpen === "import" ? (
                <span className="sidebar-status">
                  {massing.imported.length} model{massing.imported.length === 1 ? "" : "s"}
                </span>
              ) : null
            }
            rightStatus={
              rightOpen === "summary" ? (
                <span className="sidebar-status">
                  <i className="status-dot is-ready" aria-hidden="true" />
                  Ready
                </span>
              ) : rightOpen === "buildings" ? (
                <span className="sidebar-status">
                  {comMeasuredHeightCount.toLocaleString()} of {displayModel.buildings.length.toLocaleString()} measured
                </span>
              ) : null
            }
            rightFooter={
              rightOpen === "buildings" ? (
                <p className="sidebar-foot-note">
                  {overrideResult.manualCount.toLocaleString()} manual height
                  {overrideResult.manualCount === 1 ? "" : "s"}
                </p>
              ) : null
            }
            rightChildren={
              <>
            <div className="drawer-section" hidden={rightOpen !== "summary"}>
              <div className="kpi-grid mono" aria-label="In this model">
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Bldgs</div>
                  <div className="kpi-num k-val">{model.buildings.length.toLocaleString()}</div>
                </div>
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Trees</div>
                  <div className="kpi-num k-val">{model.trees.length.toLocaleString()}</div>
                </div>
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Roads</div>
                  <div className="kpi-num k-val">{formatLengthKm(model.roadKm)}k</div>
                </div>
                <div className="kpi-cell">
                  <div className="kpi-lbl k-lbl">Elev</div>
                  <div className="kpi-num k-val">
                    {model.terrain ? `${model.terrain.min.toFixed(0)}–${model.terrain.max.toFixed(0)}m` : "—"}
                  </div>
                </div>
              </div>
              {model.terrainError && <p className="error">{model.terrainError}</p>}
              {showBuildings && heightBar.total > 0 && (
                <>
                  <div className="outliner-divider" aria-hidden="true" />
                  <section className="dist-block">
                    <div className="dist-head">
                      <h3 className="dist-title">Height Precision</h3>
                      <span className="dist-pct mono">
                        {Math.round((heightBar.measured / heightBar.total) * 100)}% CoM LiDAR
                      </span>
                    </div>
                    <div className="dist-bar" aria-hidden="true">
                      <div
                        className="dist-seg is-ink"
                        style={{ width: `${Math.round((heightBar.measured / heightBar.total) * 100)}%` }}
                      />
                      <div
                        className="dist-seg is-muted"
                        style={{ width: `${Math.max(0, 100 - Math.round((heightBar.measured / heightBar.total) * 100))}%` }}
                      />
                    </div>
                    <div className="dist-legend bar-legend-grid">
                      <span className="dist-leg-item">
                        <span className="dl-left">
                          <span className="leg-dot is-ink" />
                          <span>CoM 2023</span>
                        </span>
                        <b className="dl-val mono">{comMeasuredHeightCount.toLocaleString()}</b>
                      </span>
                      <span className="dist-leg-item">
                        <span className="dl-left">
                          <span className="leg-dot is-muted" />
                          <span>Zone est.</span>
                        </span>
                        <b className="dl-val mono">{(heightBar.total - comMeasuredHeightCount).toLocaleString()}</b>
                      </span>
                    </div>
                  </section>
                </>
              )}
              {showBuildings && displayModel.buildings.length > 0 && (
                <>
                  <div className="outliner-divider" aria-hidden="true" />
                  <section className="dist-block">
                    <div className="dist-head">
                      <h3 className="dist-title">Building Use Mix</h3>
                      <span className="dist-pct mono">CLUE + OSM</span>
                    </div>
                    <div className="dist-bar" aria-hidden="true">
                      {BUILDING_USES.map((use) =>
                        useCounts[use] > 0 ? (
                          <div
                            key={use}
                            className="dist-seg"
                            style={{
                              width: `${Math.max(2, Math.round((useCounts[use] / displayModel.buildings.length) * 100))}%`,
                              background: BUILDING_USE_META[use].color,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="dist-legend bar-legend-grid">
                      {BUILDING_USES.filter((use) => useCounts[use] > 0)
                        .slice(0, 4)
                        .map((use) => {
                          const pct = Math.round((useCounts[use] / displayModel.buildings.length) * 100);
                          return (
                            <span key={use} className="dist-leg-item">
                              <span className="dl-left">
                                <span className="leg-dot" style={{ background: BUILDING_USE_META[use].color }} />
                                <span>{BUILDING_USE_META[use].label}</span>
                              </span>
                              <b className="dl-val mono">{pct}%</b>
                            </span>
                          );
                        })}
                    </div>
                  </section>
                </>
              )}
              <details className="insp-sources-details sr-only">
                <summary className="insp-sources-summary mono">
                  <span>
                    Data sources ({sourcesLoaded.loaded}/{sourcesLoaded.total} loaded)
                  </span>
                  <span className="insp-sources-caret" aria-hidden="true">▾</span>
                </summary>
                <div className="insp-sources-body">
                  <p className="sidebar-coord">
                    <span>
                      {formatCoord(model.center.lat)}, {formatCoord(model.center.lon)}
                    </span>
                    <button
                      type="button"
                      className="sidebar-icon-btn"
                      aria-label="Copy coordinates"
                      title="Copy coordinates"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(`${formatCoord(model.center.lat)}, ${formatCoord(model.center.lon)}`)
                          .catch(() => undefined);
                      }}
                    >
                      <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </p>
                  <ul className="source-list">
                    {dataSources.map((row) => (
                      <li key={row.id} className={`source-row is-${row.status}`} data-source={row.id}>
                        <i className={`status-dot is-${row.status}`} aria-hidden="true" />
                        <div className="source-text">
                          <span className="source-name">{row.label}</span>
                          {row.detail && <span className="source-meta">{row.detail}</span>}
                          {row.notes.map((note) => (
                            <span key={note} className="source-note" role={row.status === "failed" ? "alert" : undefined}>
                              {note}
                            </span>
                          ))}
                          {row.retry === "com-heights" && (
                            <button type="button" className="sidebar-link" onClick={retryComHeights}>
                              Retry CoM heights
                            </button>
                          )}
                        </div>
                        <span className="source-state">{dataSourceStatusWord(row.status)}</span>
                      </li>
                    ))}
                  </ul>
                  <details className="source-notes">
                    <summary>Full source notes and credits</summary>
                    <p className="meta">{displayModel.sourceNote}</p>
                  </details>
                </div>
              </details>
            </div>

            <div className="drawer-section legend" hidden={rightOpen !== "buildings"}>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Colour by</h3>
                  <div className="segmented" role="group" aria-label="Colour buildings by">
                    <button
                      type="button"
                      data-autofocus="true"
                      aria-pressed={colourByUse && !showSourceOrReliability}
                      onClick={() => {
                        pickSourceStyle(false);
                        setColourByUse(true);
                      }}
                    >
                      Use
                    </button>
                    <button type="button" aria-pressed={showSource} onClick={() => pickSourceStyle(true)}>
                      Source
                    </button>
                    <button type="button" aria-pressed={showReliability} onClick={pickReliabilityStyle}>
                      Reliability
                    </button>
                    <button
                      type="button"
                      aria-pressed={!colourByUse && !showSourceOrReliability}
                      onClick={() => {
                        pickSourceStyle(false);
                        setColourByUse(false);
                      }}
                    >
                      None
                    </button>
                  </div>
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Use</h3>
                    <span>{model.buildings.length.toLocaleString()}</span>
                  </div>
                  <ul className="legend-two">
                    {BUILDING_USES.filter((use) => useCounts[use] > 0).map((use) => (
                      <li key={use}>
                        <label
                          className="legend-swatch"
                          style={{
                            background: colourByUse && !showSourceOrReliability ? BUILDING_USE_META[use].color : uniform,
                          }}
                          title={`Change ${BUILDING_USE_META[use].label.toLowerCase()} colour`}
                        >
                          {rightOpen === "buildings" && (
                            <input
                              type="color"
                              aria-label={`${BUILDING_USE_META[use].label} colour`}
                              value={BUILDING_USE_META[use].color.toLowerCase()}
                              onChange={(event) => pickBuildingUseColour(use, event.target.value)}
                            />
                          )}
                        </label>
                        <span>{BUILDING_USE_META[use].label}</span>
                        <b>{useCounts[use].toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Source</h3>
                  <ul>
                    {SOURCE_COUNT_KEYS.map((source) => (
                      <li key={source}>
                        <i
                          className={SOURCE_META[source].inferred ? "hatch" : undefined}
                          style={{
                            backgroundColor: showSource ? SOURCE_META[source].color : uniform,
                          }}
                        />
                        <span>{SOURCE_META[source].label}</span>
                        <b>{sourceCounts[source].toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Height source</h3>
                  <ul>
                    {heightTierLegend
                      .filter(({ tier }) => tier === "lidar" || heightTierCounts[tier] > 0)
                      .map(({ tier, label }) => (
                        <li key={tier} className={tier === "lidar" && heightTierCounts.lidar === 0 ? "is-empty" : undefined}>
                          <i className={`height-bar-${HEIGHT_TIER_BAR[tier]}`} />
                          <span>{label}</span>
                          <b>
                            {(tier === "com" ? comMeasuredHeightCount : heightTierCounts[tier]).toLocaleString()}
                          </b>
                        </li>
                      ))}
                  </ul>
                  {comHeightsMeasuredOn && comMeasuredHeightCount > 0 && (
                    <p className="legend-note">
                      {comMeasuredHeightCount.toLocaleString()} building
                      {comMeasuredHeightCount === 1 ? "" : "s"} use City of Melbourne measured heights in this
                      frame.
                    </p>
                  )}
                  {comHeightsStatusNote && (
                    <p className="legend-note" role="status">
                      {comHeightsStatusNote}
                    </p>
                  )}
                  {comHeightsStatus === "failed" && (
                    <div className="panel-toolbar">
                      <button type="button" onClick={retryComHeights}>
                        Retry CoM heights
                      </button>
                    </div>
                  )}
                  {comHeightsMeasuredOn && (
                    <p className="legend-note">
                      <a href={COM_BUILDING_HEIGHTS_DATASET_URL} target="_blank" rel="noopener noreferrer">{COM_BUILDING_HEIGHTS_CREDIT}</a>
                    </p>
                  )}
                  <p className="legend-note" role="status">
                    {lidarTierNote}
                  </p>
                  {model.useTierFailures?.map((failure) => (
                    <p key={failure.id} className="legend-note">
                      {failure.message}
                    </p>
                  ))}
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Hidden buildings</h3>
                    <span>{hiddenMatch.size.toLocaleString()}</span>
                  </div>
                  <HiddenBuildingsPanel
                    hidden={[...hiddenMatch.values()]}
                    onShow={(entry) => persistHidden(showHiddenEntry(hiddenStore, entry))}
                    onShowAll={() => persistHidden(showAllInCut(hiddenStore, hiddenMatch.values()))}
                  />
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Edited building heights</h3>
                    <span>{overrideResult.manualCount.toLocaleString()}</span>
                  </div>
                  <HeightOverridePanel
                    manualCount={overrideResult.manualCount}
                    unmatchedCount={unmatchedEdits}
                    showManualEdits={showManualEdits}
                    onToggleShowManual={() => {
                      setShowManualEdits((on) => {
                        const next = !on;
                        writeStoredShowManualHeights(window.localStorage, next);
                        return next;
                      });
                    }}
                    onResetAll={resetAllHeights}
                    onExport={exportHeightEdits}
                    onImport={importHeightEdits}
                  />
                </section>
            </div>

            <div className="drawer-section tree-sizes" hidden={rightOpen !== "trees"}>
                <ul className="tree-tiers">
                  {(
                    [
                      ["com", "City of Melbourne"],
                      ["osm", "OpenStreetMap"],
                      ["vicmap", "Vicmap"],
                      ["canopy", "Canopy infill"],
                    ] as const
                  ).map(([tier, label]) => (
                    <li key={tier}>
                      <span>{label}</span>
                      <b>{tierCounts[tier].toLocaleString()}</b>
                    </li>
                  ))}
                </ul>
                <p className="tree-readout">{treeSizeSummary(model.trees)}</p>
                {model.treeSource?.kind === "prebake" && model.treeSource.osmFromFile && tierCounts.osm > 0 && (
                  <p className="tree-credit">{OSM_TREES_ODBL_CREDIT}</p>
                )}
                {(model.treeLoadNotes ?? []).map((note) => (
                  <p key={note.source} className="legend-note tree-load-note" role="status">
                    {note.message}
                  </p>
                ))}
                {model.treeCapHit && (
                  <p className="legend-note">
                    Tree count was capped at 8,000. Canopy infill was trimmed first, then Vicmap.
                  </p>
                )}
                {tierCounts.com > 0 && (
                  <p className="tree-credit">
                    <a href={COM_TREES_DATASET_URL} target="_blank" rel="noopener noreferrer">
                      {COM_TREES_CREDIT}
                    </a>
                  </p>
                )}
                {tierCounts.vicmap > 0 && <p className="tree-credit">{VICMAP_ATTRIBUTION}</p>}
              </div>
              </>
            }
          >
            <div className="drawer-section" hidden={leftOpen !== "drawing"}>
              {tab === "3d" && (
                <div className="projection-block outliner-body">
                  <section className="sidebar-group outliner-section" aria-label="View modes">
                    <div className="card-head sidebar-gh">
                      <h3 className="card-title">View Style</h3>
                      <span className="card-meta mono">
                        {displayModel.buildings.length.toLocaleString()} massings
                      </span>
                    </div>
                    <div className="style-seg seg-mini" role="group" aria-label="Building style">
                      <button
                        type="button"
                        className={view3dDisplay.whiteCard ? "style-btn active" : "style-btn"}
                        aria-pressed={view3dDisplay.whiteCard}
                        onClick={() => commitView3dDisplay({ ...view3dDisplay, whiteCard: !view3dDisplay.whiteCard })}
                      >
                        Card
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.whiteCard && colourByUse && !showSourceOrReliability ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.whiteCard && colourByUse && !showSourceOrReliability}
                        onClick={() => {
                          pickSourceStyle(false);
                          setColourByUse(true);
                          if (view3dDisplay.whiteCard) {
                            commitView3dDisplay({ ...view3dDisplay, whiteCard: false });
                          }
                        }}
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.whiteCard && showSource ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.whiteCard && showSource}
                        onClick={() => {
                          pickSourceStyle(true);
                          if (view3dDisplay.whiteCard) {
                            commitView3dDisplay({ ...view3dDisplay, whiteCard: false });
                          }
                        }}
                      >
                        Source
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.whiteCard && showReliability ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.whiteCard && showReliability}
                        data-style="reliability"
                        onClick={() => {
                          pickReliabilityStyle();
                          if (view3dDisplay.whiteCard) {
                            commitView3dDisplay({ ...view3dDisplay, whiteCard: false });
                          }
                        }}
                      >
                        Reliability
                      </button>
                      <button
                        type="button"
                        className={!view3dDisplay.whiteCard && !colourByUse && !showSourceOrReliability ? "style-btn active" : "style-btn"}
                        aria-pressed={!view3dDisplay.whiteCard && !colourByUse && !showSourceOrReliability}
                        onClick={() => {
                          pickSourceStyle(false);
                          setColourByUse(false);
                          if (view3dDisplay.whiteCard) {
                            commitView3dDisplay({ ...view3dDisplay, whiteCard: false });
                          }
                        }}
                      >
                        Uniform
                      </button>
                    </div>
                    {showReliability && !view3dDisplay.whiteCard && <ReliabilityLegend buildings={displayModel.buildings} />}
                    <label className="check-field sr-only">
                      <input
                        type="checkbox"
                        checked={view3dDisplay.whiteCard}
                        onChange={(event) => commitView3dDisplay({ ...view3dDisplay, whiteCard: event.target.checked })}
                      />
                      White card
                    </label>
                    <div className="mini-flags sub-toggles display-switches" role="group" aria-label="View modes">
                      <label className={view3dDisplay.showOutlines ? "mini-flag is-on check-field" : "mini-flag check-field"}>
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={view3dDisplay.showOutlines}
                          onChange={(event) => commitView3dDisplay({ ...view3dDisplay, showOutlines: event.target.checked })}
                        />
                        <span>Outlines</span>
                        <span className={`mini-chk ${view3dDisplay.showOutlines ? "on" : ""}`} aria-hidden="true">{view3dDisplay.showOutlines ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                      </label>
                      <label className={showManualEdits ? "mini-flag is-on check-field" : "mini-flag check-field"}>
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={showManualEdits}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setShowManualEdits(next);
                            writeStoredShowManualHeights(window.localStorage, next);
                          }}
                        />
                        <span>Manual edits</span>
                        <span className={`mini-chk ${showManualEdits ? "on" : ""}`} aria-hidden="true">{showManualEdits ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                      </label>
                    </div>
                  </section>
                  <section
                    className={
                      view.projection === "iso"
                        ? "sidebar-group outliner-section"
                        : "sidebar-group outliner-section sr-only"
                    }
                    aria-label="Projection"
                  >
                    <div className="sidebar-gh sr-only">
                      <h3>Projection</h3>
                    </div>
                    <div className="plan-switch sr-only" role="group" aria-label="Projection">
                      <button
                        type="button"
                        aria-pressed={view.projection === "perspective"}
                        onClick={() => commitView({ ...view, projection: "perspective" }, false)}
                      >
                        Perspective
                      </button>
                      <button
                        type="button"
                        aria-pressed={view.projection === "iso"}
                        onClick={() => commitView({ ...view, projection: "iso" }, false)}
                      >
                        Isometric
                      </button>
                      <button
                        type="button"
                        aria-pressed={view.projection === "plan"}
                        onClick={() => commitView({ projection: "plan", corner: view.corner, freeRotate: false }, true)}
                      >
                        Plan, north-up
                      </button>
                    </div>
                    {view.projection === "plan" && (
                      <p className="field-note">Orthographic plan view. Choose Perspective to return to the 3D orbit camera.</p>
                    )}
                    {view.projection === "iso" && (
                      <>
                        <p className="kicker">Corner</p>
                        <div className="plan-switch" role="group" aria-label="Isometric corner">
                          {ISO_CORNERS.map((corner) => (
                            <button
                              key={corner}
                              type="button"
                              aria-pressed={view.corner === corner && !view.freeRotate}
                              onClick={() => commitView({ projection: "iso", corner, freeRotate: false }, true)}
                            >
                              {CORNER_LABEL[corner]}
                            </button>
                          ))}
                        </div>
                        <label className="check-field">
                          <input
                            type="checkbox"
                            checked={view.freeRotate}
                            onChange={(event) => {
                              const freeRotate = event.target.checked;
                              commitView(
                                { ...view, projection: "iso", freeRotate },
                                snapWhenTogglingIsoFreeRotate(),
                              );
                            }}
                          />
                          Free rotate (axonometric)
                        </label>
                        {view.freeRotate && (
                          <p className="iso-warning">
                            Free rotate is on, so this is no longer a true isometric view. Turn it off to lock pan-only
                            at the current angle, or pick a corner for a true isometric view.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                  {sceneLayerRows.length > 0 && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section" aria-label="Layers">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Scene Layers</h3>
                          <div className="studio-layer-head-actions">
                            <span className="card-meta mono">
                              {sceneLayerRows.filter((row) => row.visible).length} visible
                            </span>
                            <button
                              type="button"
                              className="studio-reset-colours-btn"
                              onClick={resetSceneLayerColours}
                              title="Reset all layer and building use colours to default"
                            >
                              Reset colours
                            </button>
                          </div>
                        </div>
                        <div className="outliner-rows display-switches" role="group" aria-label="3D layers">
                          {sceneLayerRows.map((layer) => (
                            <div key={layer.id} className="o-row studio-layer-row">
                              <label className="o-left check-field">
                                <input
                                  className="sr-only"
                                  type="checkbox"
                                  checked={layer.visible}
                                  onChange={(event) => layer.onToggle(event.target.checked)}
                                />
                                <span className={layer.visible ? "o-eye l-eye on" : "o-eye l-eye off"} aria-hidden="true">{layer.visible ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                                <span className="o-name">{layer.label}</span>
                              </label>
                              <span className="o-right">
                                {layer.meta ? (
                                  <span className="o-count studio-layer-meta mono" aria-hidden="true">
                                    {layer.meta}
                                  </span>
                                ) : null}
                                <label
                                  className="o-swatch-wrap legend-swatch"
                                  style={{ background: layer.color }}
                                  title={`Change ${layer.label.toLowerCase()} colour`}
                                >
                                  <input
                                    type="color"
                                    className="o-swatch-input"
                                    aria-label={`${layer.label} colour`}
                                    value={layer.color.toLowerCase()}
                                    onInput={(event) => layer.onPick((event.target as HTMLInputElement).value)}
                                    onChange={(event) => layer.onPick(event.target.value)}
                                  />
                                </label>
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}
              {tab === "drawing" && (
                <div
                  className="projection-block outliner-body"
                  data-plan-width={planWidth === null ? undefined : Math.round(planWidth)}
                >
                  <section className="sidebar-group outliner-section" aria-label="View modes">
                    <div className="card-head sidebar-gh">
                      <h3 className="card-title">View Style</h3>
                      <span className="card-meta mono">
                        {drawingModel.buildings.length.toLocaleString()} massings
                      </span>
                    </div>
                    {drawing !== "figure-ground" && (
                      <>
                        <div className="style-seg seg-mini" role="group" aria-label="Building style">
                          <button
                            type="button"
                            className={colourByUse && !showSourceOrReliability ? "style-btn active" : "style-btn"}
                            aria-pressed={colourByUse && !showSourceOrReliability}
                            onClick={() => {
                              pickSourceStyle(false);
                              setColourByUse(true);
                            }}
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            className={showSource ? "style-btn active" : "style-btn"}
                            aria-pressed={showSource}
                            onClick={() => {
                              pickSourceStyle(true);
                            }}
                          >
                            Source
                          </button>
                          <button
                            type="button"
                            className={showReliability ? "style-btn active" : "style-btn"}
                            aria-pressed={showReliability}
                            data-style="reliability"
                            onClick={pickReliabilityStyle}
                          >
                            Reliability
                          </button>
                          <button
                            type="button"
                            className={!colourByUse && !showSourceOrReliability ? "style-btn active" : "style-btn"}
                            aria-pressed={!colourByUse && !showSourceOrReliability}
                            onClick={() => {
                              pickSourceStyle(false);
                              setColourByUse(false);
                            }}
                          >
                            Uniform
                          </button>
                        </div>
                        {showReliability && <ReliabilityLegend buildings={displayModel.buildings} />}
                        <div className="mini-flags sub-toggles display-switches" role="group" aria-label="View modes">
                          <label className={showManualEdits ? "mini-flag is-on check-field" : "mini-flag check-field"}>
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={showManualEdits}
                              onChange={(event) => {
                                const next = event.target.checked;
                                setShowManualEdits(next);
                                writeStoredShowManualHeights(window.localStorage, next);
                              }}
                            />
                            <span>Manual edits</span>
                            <span className={`mini-chk ${showManualEdits ? "on" : ""}`} aria-hidden="true">{showManualEdits ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                          </label>
                        </div>
                      </>
                    )}
                    <label className="scale-field studio-scale-row">
                      <span>Plan scale</span>
                      <select
                        value={figureScale}
                        aria-label="Plan scale"
                        onChange={(event) => setFigureScale(Number(event.target.value))}
                      >
                        {FIGURE_SCALES.map((scale) => (
                          <option key={scale} value={scale}>
                            1:{scale}
                          </option>
                        ))}
                      </select>
                    </label>
                    {figureFit && <p className="fit-note">{figureFit}</p>}
                    {model.contourLayer && (
                      <p
                        className="field-note"
                        data-contour-source={model.contourLayer.source}
                        data-contour-features={model.contourLayer.featureCount}
                        data-contour-lines={model.contourLayer.lines.length}
                        data-contour-ms={model.contourLayer.fetchMs}
                        data-contour-interval={model.contourLayer.interval}
                        data-contour-drawn={contourDrawerLabel(
                          model.contourLayer,
                          figureScale,
                          lineStyles.contourCoarseIntervalM,
                          lineStyles.contourCoarseFromScale,
                        )}
                      >
                        Contours:{" "}
                        {contourDrawerLabel(
                          model.contourLayer,
                          figureScale,
                          lineStyles.contourCoarseIntervalM,
                          lineStyles.contourCoarseFromScale,
                        )}
                      </p>
                    )}
                  </section>
                  {drawing === "isometric" && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section iso-drawing-controls" aria-label="Compass view">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Compass view</h3>
                        </div>
                        <div className="plan-switch" role="group" aria-label="Isometric corner">
                          {ISO_CORNERS.map((corner) => (
                            <button
                              key={corner}
                              type="button"
                              aria-pressed={view.corner === corner}
                              onClick={() => {
                                commitView({ ...view, corner }, false);
                                setIsoDrawingViewport(
                                  explodedAxoViewportExtent(isometricDrawingBounds(displayModel, corner)),
                                );
                              }}
                            >
                              {CORNER_LABEL[corner]}
                            </button>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                  {drawing === "exploded-axo" && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section axo-controls" aria-label="Exploded layers">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Exploded Stack</h3>
                        </div>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const next = referenceExplodedAxoSettings(displayModel.sideM, axoSettings);
                            setAxoSettings(next);
                            setExplodedViewport(explodedAxoViewportExtent(explodedAxoBounds(displayModel, next)));
                          }}
                        >
                          Reference preset
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const next = defaultExplodedAxoSettings(displayModel.sideM);
                            setAxoSettings((prev) => ({ ...next, gapM: prev.gapM, showLabels: prev.showLabels, ...(prev.terrainExaggeration != null ? { terrainExaggeration: prev.terrainExaggeration } : {}) }));
                            setExplodedViewport(explodedAxoViewportExtent(explodedAxoBounds(displayModel, { ...next, gapM: axoSettings.gapM })));
                          }}
                        >
                          Default stack
                        </button>
                        <ul className="axo-layer-list" aria-label="Exploded axonometric layers (drag to reorder)">
                          {axoSettings.layerOrder.map((id) => (
                            <li
                              key={id}
                              draggable
                              data-axo-layer-item={id}
                              aria-label={`${AXO_LAYER_LABELS[id]} layer (drag up or down)`}
                              onDragStart={(event) => {
                                draggedAxoLayer.current = id;
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", id);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                const from = draggedAxoLayer.current;
                                if (from && from !== id) dragReorderAxoLayer(from, id);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const from = (draggedAxoLayer.current ?? event.dataTransfer.getData("text/plain")) as AxoLayerId;
                                if (from && from !== id) dragReorderAxoLayer(from, id);
                                draggedAxoLayer.current = null;
                              }}
                              onDragEnd={() => {
                                draggedAxoLayer.current = null;
                              }}
                            >
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={axoSettings.layerVisible[id]}
                                  onChange={(event) =>
                                    setAxoSettings((prev) => ({
                                      ...prev,
                                      layerVisible: { ...prev.layerVisible, [id]: event.target.checked },
                                    }))
                                  }
                                />
                                {AXO_LAYER_LABELS[id]}
                              </label>
                              <span className="axo-layer-drag-handle" aria-hidden="true" title="Drag up or down to set height">
                                <GripVertical size={14} strokeWidth={1.6} />
                              </span>
                            </li>
                          ))}
                        </ul>
                        <label className="scale-field">
                          Layer gap, m
                          <input
                            type="range"
                            min={Math.round(defaultExplodedAxoGapM(displayModel.sideM) * 0.5)}
                            max={1000}
                            step={1}
                            value={Math.round(axoSettings.gapM)}
                            onChange={(event) =>
                              setAxoSettings((prev) => {
                                const { layerLiftM: _cleared, ...rest } = prev;
                                return { ...rest, gapM: Number(event.target.value) };
                              })
                            }
                          />
                          <span>{Math.round(axoSettings.gapM)} m</span>
                        </label>
                        {axoSettings.layerVisible.terrain && (
                          <label className="scale-field">
                            Terrain exaggeration
                            <input
                              type="range"
                              min={AXO_TERRAIN_EXAGGERATION_RANGE.min}
                              max={AXO_TERRAIN_EXAGGERATION_RANGE.max}
                              step={AXO_TERRAIN_EXAGGERATION_RANGE.step}
                              value={axoSettings.terrainExaggeration ?? DEFAULT_AXO_TERRAIN_EXAGGERATION}
                              onChange={(event) =>
                                setAxoSettings((prev) => ({ ...prev, terrainExaggeration: Number(event.target.value) }))
                              }
                            />
                            <span>×{axoSettings.terrainExaggeration ?? DEFAULT_AXO_TERRAIN_EXAGGERATION}</span>
                          </label>
                        )}
                        <label className="check-field">
                          <input
                            type="checkbox"
                            checked={axoSettings.showLabels}
                            onChange={(event) => setAxoSettings((prev) => ({ ...prev, showLabels: event.target.checked }))}
                          />
                          Layer labels
                        </label>
                      </section>
                    </>
                  )}
                  {sceneLayerRows.length > 0 && (
                    <>
                      <div className="outliner-divider" aria-hidden="true" />
                      <section className="sidebar-group outliner-section" aria-label="Layers">
                        <div className="card-head sidebar-gh">
                          <h3 className="card-title">Scene Layers</h3>
                          <div className="studio-layer-head-actions">
                            <span className="card-meta mono">
                              {sceneLayerRows.filter((row) => row.visible).length} visible
                            </span>
                            <button
                              type="button"
                              className="studio-reset-colours-btn"
                              onClick={resetSceneLayerColours}
                              title="Reset all layer and building use colours to default"
                            >
                              Reset colours
                            </button>
                          </div>
                        </div>
                        <div className="outliner-rows display-switches" role="group" aria-label="3D layers">
                          {sceneLayerRows.map((layer) => (
                            <div key={layer.id} className="o-row studio-layer-row">
                              <label className="o-left check-field">
                                <input
                                  className="sr-only"
                                  type="checkbox"
                                  checked={layer.visible}
                                  onChange={(event) => layer.onToggle(event.target.checked)}
                                />
                                <span className={layer.visible ? "o-eye l-eye on" : "o-eye l-eye off"} aria-hidden="true">{layer.visible ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg> : null}</span>
                                <span className="o-name">{layer.label}</span>
                              </label>
                              <span className="o-right">
                                {layer.meta ? (
                                  <span className="o-count studio-layer-meta mono" aria-hidden="true">
                                    {layer.meta}
                                  </span>
                                ) : null}
                                <label
                                  className="o-swatch-wrap legend-swatch"
                                  style={{ background: layer.color }}
                                  title={`Change ${layer.label.toLowerCase()} colour`}
                                >
                                  <input
                                    type="color"
                                    className="o-swatch-input"
                                    aria-label={`${layer.label} colour`}
                                    value={layer.color.toLowerCase()}
                                    onInput={(event) => layer.onPick((event.target as HTMLInputElement).value)}
                                    onChange={(event) => layer.onPick(event.target.value)}
                                  />
                                </label>
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}
              {tab === "satellite" && (
                <p className="field-note">Satellite is a preview of this frame. It is not included in the downloads.</p>
              )}
            </div>

            <div className="drawer-section" hidden={leftOpen !== "analysis"}>
              <div className="tabs site-analysis-tabs" role="tablist" aria-label="Site Analysis">
                {SITE_ANALYSIS_KINDS.map((kind) => {
                  const Icon = ANALYSIS_ICONS[kind];
                  const active = analysisKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      data-analysis={kind}
                      aria-selected={active}
                      className={active ? "site-analysis-tab is-active" : "site-analysis-tab"}
                      onClick={() => setAnalysisKind(kind)}
                    >
                      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                      <span>{SITE_ANALYSIS_LABELS[kind]}</span>
                    </button>
                  );
                })}
              </div>
              <div hidden={analysisKind !== "solar"}>
                <SolarPanel
                  embedded
                  settings={solar}
                  onChange={commitSolar}
                  sideM={model.sideM}
                  site={{ lat: model.center.lat, lon: model.center.lon }}
                  selectedCount={sunStudySelected.length}
                  onClearSelection={() => setSunStudySelected([])}
                />
              </div>
              <div hidden={analysisKind !== "wind"}>
                <WindPanel
                  embedded
                  settings={windSettings}
                  onChange={commitWind}
                  note={windNote}
                  streaksPaused={windMotion.streaksPaused}
                  animateAnyway={windMotion.animateAnyway}
                  onAnimateAnyway={windMotion.setAnimateAnyway}
                />
              </div>
              <div hidden={analysisKind !== "view"}>
                <ViewPanel walk={walk} />
              </div>
            </div>

            <div className="drawer-section" hidden={leftOpen !== "import"}>
              <ImportMassingPanel
                imported={massing.imported}
                warnings={massing.warnings}
                crsName={crs.name}
                placingId={massing.placingId}
                busy={massing.busy}
                error={massing.error}
                onImport={(file) => void massing.importFile(file)}
                onMode={massing.setMode}
                onPlacement={massing.setPlacement}
                onSnap={massing.snapToGround}
                onResetMga={massing.resetToMga}
                onToggleVisible={massing.toggleVisible}
                onColour={massing.setColour}
                onRemove={massing.remove}
              />
            </div>

            <div className="drawer-section" hidden={leftOpen !== "exports"}>
              <div className="exports">
                <ExportTiles
                  tiles={exportTiles({
                    tab,
                    drawing,
                    busy,
                    figureScale,
                    sunStudyDate: sunStudyDateText({ year: solar.year, month: solar.month, day: solar.day }),
                    buildingsAsMesh,
                    crsName: crs.name,
                    sunStudy: Boolean(solar.sunStudy),
                  })}
                  progress={busy === "ai-sun" ? sunStudyProgress : null}
                  onDownload={(id) => {
                    if (id === "3dm") void save3dm();
                    else if (id === "png") void savePng();
                    else if (id === "sun-zip") void saveSunStudyAi();
                    else if (id === "svg")
                      void (drawing === "figure-ground"
                        ? saveFigureSvg()
                        : drawing === "isometric"
                          ? saveIsometricSvg()
                          : saveSiteSvg());
                    else if (drawing === "site") void saveSiteAi();
                    else if (drawing === "figure-ground") void saveFigureAi();
                    else if (drawing === "isometric") void saveIsometricAi();
                    else void saveExplodedAxoAi();
                  }}
                />
                <label className="check-field rhino-mesh-option">
                  <input
                    type="checkbox"
                    checked={buildingsAsMesh}
                    onChange={(event) => setBuildingsAsMesh(event.target.checked)}
                  />
                  Rhino: buildings as mesh
                </label>
                <label className="scale-field">
                  Plan scale
                  <select
                    value={figureScale}
                    aria-label="Export plan scale"
                    onChange={(event) => setFigureScale(Number(event.target.value))}
                  >
                    {FIGURE_SCALES.map((scale) => (
                      <option key={scale} value={scale}>
                        1:{scale}
                      </option>
                    ))}
                  </select>
                </label>
                {figureFit && (
                  <p className="fit-note" id="figure-fit">
                    {figureFit}
                  </p>
                )}
              </div>
              <p className="v2">
                This file includes {layerBits.join(", ") || "an empty block"}. DXF, DAE, and JPG are not available in
                this version.
              </p>
              <p className="v2">{CRS_NOTE}</p>
              {exportError && (
                <p className="error" role="alert">
                  {exportError}
                </p>
              )}
            </div>
          </Sidebar>
        </div>
        {leftOpen === "analysis" && tab !== "satellite" ? (
          <div
            className="bottom-bar env-console hud-card"
            role="region"
            aria-label="Environmental analysis console"
          >
            <div className="env-top-row">
              <div className="env-mode-seg" role="tablist" aria-label="Environmental analysis sub-mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={analysisKind === "solar"}
                  className={analysisKind === "solar" ? "env-mode-btn active" : "env-mode-btn"}
                  onClick={() => setAnalysisKind("solar")}
                >
                  <Sun size={12} strokeWidth={2.2} aria-hidden="true" />
                  <span>Solar Study</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={analysisKind === "wind"}
                  className={analysisKind === "wind" ? "env-mode-btn active" : "env-mode-btn"}
                  onClick={() => {
                    setAnalysisKind("wind");
                    if (!windSettings.enabled) {
                      commitWind({ ...windSettings, enabled: true });
                    }
                  }}
                >
                  <Wind size={12} strokeWidth={2.2} aria-hidden="true" />
                  <span>Wind Rose</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={analysisKind === "view"}
                  className={analysisKind === "view" ? "env-mode-btn active" : "env-mode-btn"}
                  onClick={() => setAnalysisKind("view")}
                >
                  <Eye size={12} strokeWidth={2.2} aria-hidden="true" />
                  <span>Viewshed Walk</span>
                </button>
              </div>

              <span className="v-sep hud-sep" aria-hidden="true" />

              {analysisKind === "solar" && (() => {
                const azDeg = Math.round(((consoleSun.azimuthDeg % 360) + 360) % 360);
                const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                const cardinal = dirs[Math.round(azDeg / 45) % 8] ?? "N";
                const dlSpan = Math.max(0, consoleDaylight.sunset - consoleDaylight.sunrise);
                const dlHours = Math.floor(dlSpan / 60);
                const dlMins = String(dlSpan % 60).padStart(2, "0");
                return (
                  <div className="solar-telemetry mono" aria-label="Live solar telemetry">
                    <div className="st-item">
                      <span className="st-k">ALT</span>
                      <span className="st-v">{consoleSun.altitudeDeg.toFixed(1)}°</span>
                    </div>
                    <span className="st-dot" aria-hidden="true">·</span>
                    <div className="st-item">
                      <span className="st-k">AZ</span>
                      <span className="st-v">{azDeg}° {cardinal}</span>
                    </div>
                    <span className="st-dot" aria-hidden="true">·</span>
                    <div className="st-item">
                      <span className="st-k">DAYLIGHT</span>
                      <span className="st-v">{dlHours}h {dlMins}m</span>
                    </div>
                  </div>
                );
              })()}

              {analysisKind === "wind" && (
                <div className="solar-telemetry mono" aria-label="Live wind telemetry">
                  <div className="st-item">
                    <span className="st-k">PREVAILING</span>
                    <span className="st-v">{consoleWindStats ? consoleWindStats.prevailingLabel : "N, NNE"}</span>
                  </div>
                  <span className="st-dot" aria-hidden="true">·</span>
                  <div className="st-item">
                    <span className="st-k">MEDIAN</span>
                    <span className="st-v">{consoleWindStats ? `${Math.round(consoleWindStats.prevailingMedianKmh)} km/h` : "18 km/h"}</span>
                  </div>
                  <span className="st-dot" aria-hidden="true">·</span>
                  <div className="st-item">
                    <span className="st-k">CALM</span>
                    <span className="st-v">{consoleWindStats ? `${consoleWindStats.calmPercent.toFixed(1)}%` : "4.2%"}</span>
                  </div>
                </div>
              )}

              {analysisKind === "view" && (
                <div className="solar-telemetry mono" aria-label="Live viewshed telemetry">
                  <div className="st-item">
                    <span className="st-k">EYE</span>
                    <span className="st-v">{walk.eyeM.toFixed(1)}m</span>
                  </div>
                  <span className="st-dot" aria-hidden="true">·</span>
                  <div className="st-item">
                    <span className="st-k">RADIUS</span>
                    <span className="st-v">{walk.radiusM}m</span>
                  </div>
                  <span className="st-dot" aria-hidden="true">·</span>
                  <div className="st-item">
                    <span className="st-k">PATH</span>
                    <span className="st-v">{walk.clickCount > 0 ? `${Math.round(walk.lengthM)}m (${walk.clickCount} pts)` : "Click ground"}</span>
                  </div>
                </div>
              )}

              <span className="v-sep hud-sep" aria-hidden="true" />

              <div className="overlay-chips" role="group" aria-label="Scene overlay toggles">
                {analysisKind === "solar" && (
                  <>
                    {tab !== "drawing" && (
                      <button
                        type="button"
                        className={solar.showPath ? "ov-chip on" : "ov-chip"}
                        aria-pressed={solar.showPath}
                        onClick={() => commitSolar({ ...solar, showPath: !solar.showPath })}
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>3D Sun Dome</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={solar.castShadows ? "ov-chip on" : "ov-chip"}
                      aria-pressed={solar.castShadows}
                      onClick={() => commitSolar({ ...solar, castShadows: !solar.castShadows })}
                    >
                      <span className="ov-dot" aria-hidden="true" />
                      <span>Shadows</span>
                    </button>
                    {tab === "drawing" && drawing === "site" && (
                      <button
                        type="button"
                        className={solar.sunStudy ? "ov-chip on" : "ov-chip"}
                        aria-pressed={Boolean(solar.sunStudy)}
                        onClick={() =>
                          commitSolar({
                            ...solar,
                            sunStudy: !solar.sunStudy,
                            sunStudyCasters: sunStudySelected.length > 0 ? "selected" : "all",
                          })
                        }
                      >
                        <span className="ov-dot" aria-hidden="true" />
                        <span>9–3pm Plan Fan</span>
                      </button>
                    )}
                    {tab === "drawing" && drawing === "site" && Boolean(solar.sunStudy) && sunStudySelected.length > 0 && (
                      <button
                        type="button"
                        className="ov-chip on"
                        aria-label={`Clear ${sunStudySelected.length} selected shadow buildings`}
                        onClick={() => {
                          setSunStudySelected([]);
                          commitSolar({ ...solar, sunStudyCasters: "all" });
                        }}
                      >
                        <span>{sunStudySelected.length} selected ×</span>
                      </button>
                    )}
                  </>
                )}

                {analysisKind === "wind" && (
                  <>
                    <button
                      type="button"
                      className={windSettings.enabled ? "ov-chip on" : "ov-chip"}
                      aria-pressed={windSettings.enabled}
                      onClick={() => commitWind({ ...windSettings, enabled: !windSettings.enabled })}
                    >
                      <span className="ov-dot" aria-hidden="true" />
                      <span>3D Wind Flow</span>
                    </button>
                    <button
                      type="button"
                      className={windSettings.enabled && windSettings.showRose ? "ov-chip on" : "ov-chip"}
                      aria-pressed={windSettings.enabled && windSettings.showRose}
                      onClick={() =>
                        commitWind({
                          ...windSettings,
                          enabled: true,
                          showRose: !windSettings.showRose,
                        })
                      }
                    >
                      <span className="ov-dot" aria-hidden="true" />
                      <span>Wind Rose</span>
                    </button>
                  </>
                )}

                {analysisKind === "view" && (
                  <>
                    <button
                      type="button"
                      className={walk.drawing ? "ov-chip on" : "ov-chip"}
                      aria-pressed={walk.drawing}
                      onClick={() => walk.setDrawing(!walk.drawing)}
                    >
                      <span className="ov-dot" aria-hidden="true" />
                      <span>{walk.drawing ? "Drawing Path…" : "Draw Path"}</span>
                    </button>
                    <button
                      type="button"
                      className={walk.status === "ready" ? "ov-chip on" : "ov-chip"}
                      disabled={walk.sampleCount < 2 || walk.status === "computing"}
                      onClick={() => walk.compute()}
                    >
                      <span className="ov-dot" aria-hidden="true" />
                      <span>{walk.status === "ready" ? "Viewshed Ready" : "Compute View"}</span>
                    </button>
                  </>
                )}
              </div>

            </div>

            <div className="env-bottom-row">
              {analysisKind === "solar" && (() => {
                const isJun = solar.month === 6 && solar.day === 21;
                const isSep = solar.month === 9 && solar.day === 22;
                const isDec = solar.month === 12 && solar.day === 22;
                const formatMin = (m: number) =>
                  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                const curMin = solar.hour * 60 + solar.minute;
                const minBound = 5 * 60;
                const maxBound = 20 * 60;
                const thumbPct = Math.max(4, Math.min(96, ((curMin - minBound) / (maxBound - minBound)) * 100));
                return (
                  <>
                    <div className="date-presets" role="group" aria-label="Solar date presets">
                      <button
                        type="button"
                        className={isJun ? "p-pill active" : "p-pill"}
                        aria-pressed={isJun}
                        onClick={() => commitSolar({ ...solar, month: 6, day: 21, castShadows: true })}
                      >
                        21 Jun
                      </button>
                      <button
                        type="button"
                        className={isSep ? "p-pill active" : "p-pill"}
                        aria-pressed={isSep}
                        onClick={() => commitSolar({ ...solar, month: 9, day: 22, castShadows: true })}
                      >
                        22 Sep · Equinox
                      </button>
                      <button
                        type="button"
                        className={isDec ? "p-pill active" : "p-pill"}
                        aria-pressed={isDec}
                        onClick={() => commitSolar({ ...solar, month: 12, day: 22, castShadows: true })}
                      >
                        22 Dec
                      </button>
                    </div>

                    <button
                      type="button"
                      className={consolePlaying ? "play-pill mono active" : "play-pill mono"}
                      aria-label={consolePlaying ? "Pause solar animation" : "Play solar animation"}
                      aria-pressed={consolePlaying}
                      onClick={() => setConsolePlaying((p) => !p)}
                    >
                      {consolePlaying ? "❚❚ 1×" : "▶ 1×"}
                    </button>

                    <div className="daylight-scrubber mono" role="group" aria-label="Daylight horizon scrubber">
                      <span className="sun-bound" title="Melbourne sunrise">
                        ▲ {formatMin(consoleDaylight.sunrise)}
                      </span>
                      <div className="scrubber-track">
                        <div className="daylight-band" aria-hidden="true" />
                        <div className="rescode-window" title="9am–3pm Victorian ResCode assessment window" aria-hidden="true" />
                        <div className="scrubber-ticks" role="group" aria-label="Solar hour scrubber">
                          {[6, 9, 10, 11, 12, 13, 14, 15, 18].map((h) => (
                            <button
                              key={h}
                              type="button"
                              className={
                                solar.hour === h
                                  ? "scrubber-tick-btn active"
                                  : h >= 9 && h <= 15
                                    ? "scrubber-tick-btn hi"
                                    : "scrubber-tick-btn"
                              }
                              aria-label={`Solar time ${String(h).padStart(2, "0")}:00`}
                              aria-pressed={solar.hour === h}
                              onClick={() => {
                                setConsolePlaying(false);
                                commitSolar({ ...solar, hour: h, minute: 0, castShadows: true });
                              }}
                            >
                              {String(h).padStart(2, "0")}
                            </button>
                          ))}
                        </div>
                        <input
                          type="range"
                          className="scrubber-range-input"
                          aria-label="Solar time of day"
                          min={consoleDaylight.sunrise}
                          max={consoleDaylight.sunset}
                          step={5}
                          value={Math.max(consoleDaylight.sunrise, Math.min(consoleDaylight.sunset, curMin))}
                          onChange={(e) => {
                            setConsolePlaying(false);
                            const total = Number(e.target.value);
                            commitSolar({
                              ...solar,
                              hour: Math.floor(total / 60),
                              minute: total % 60,
                              castShadows: true,
                            });
                          }}
                        />
                        <div className="scrubber-thumb" style={{ left: `${thumbPct}%` }} aria-hidden="true" />
                      </div>
                      <span className="sun-bound" title="Melbourne sunset">
                        ▼ {formatMin(consoleDaylight.sunset)}
                      </span>
                      <span className="time-readout-pill">
                        ☀ {String(solar.hour).padStart(2, "0")}:{String(solar.minute).padStart(2, "0")} AEST
                      </span>
                    </div>
                  </>
                );
              })()}

              {analysisKind === "wind" && (
                <>
                  <div className="date-presets" role="group" aria-label="Wind season presets">
                    {(["annual", "summer", "autumn", "winter", "spring"] as const).map((periodId) => (
                      <button
                        key={periodId}
                        type="button"
                        className={windSettings.period === periodId ? "p-pill active" : "p-pill"}
                        aria-pressed={windSettings.period === periodId}
                        onClick={() => commitWind({ ...windSettings, enabled: true, period: periodId as WindPeriodId })}
                      >
                        {periodId === "annual"
                          ? "Annual"
                          : periodId === "summer"
                            ? "Summer"
                            : periodId === "autumn"
                              ? "Autumn"
                              : periodId === "winter"
                                ? "Winter"
                                : "Spring"}
                      </button>
                    ))}
                  </div>
                  <div className="daylight-scrubber wind-console-bar mono">
                    <span className="sun-bound">
                      {WIND_PERIOD_LABELS[windSettings.period as keyof typeof WIND_PERIOD_LABELS] ?? "Annual"}
                    </span>
                    <div className="wind-band-pills" aria-label="Wind speed scale (km/h)">
                      <span className="wind-band-chip band-0">2–10 km/h</span>
                      <span className="wind-band-chip band-1">10–20</span>
                      <span className="wind-band-chip band-2">20–30</span>
                      <span className="wind-band-chip band-3">30–40</span>
                      <span className="wind-band-chip band-4">40+ km/h</span>
                    </div>
                    <span className="time-readout-pill">
                      🌬 {consoleWindStats ? `${consoleWindStats.prevailingLabel} · ${Math.round(consoleWindStats.prevailingMedianKmh)} km/h` : "ERA5 10m Wind"}
                    </span>
                  </div>
                </>
              )}

              {analysisKind === "view" && (
                <>
                  <button
                    type="button"
                    className="play-pill mono"
                    aria-label={walk.playing ? "Pause walk" : "Play walk"}
                    disabled={walk.status !== "ready" && walk.status !== "computing"}
                    onClick={() => walk.setPlaying(!walk.playing)}
                  >
                    {walk.playing ? "⏸ Pause" : "▶ Play"}
                  </button>
                  <div className="date-presets" role="group" aria-label="Viewshed walk speed, eye height, and radius presets">
                    {WALK_SPEEDS.map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={walk.speed === spd ? "p-pill active mono" : "p-pill mono"}
                        aria-label={`${spd}× walk speed`}
                        aria-pressed={walk.speed === spd}
                        onClick={() => walk.setSpeed(spd)}
                      >
                        {spd}×
                      </button>
                    ))}
                    {[
                      [1.6, "1.6m"],
                      [4.5, "4.5m"],
                      [10, "10m"],
                    ].map(([eyeVal, label]) => (
                      <button
                        key={String(label)}
                        type="button"
                        className={Math.abs(walk.eyeM - Number(eyeVal)) < 0.15 ? "p-pill active" : "p-pill"}
                        aria-pressed={Math.abs(walk.eyeM - Number(eyeVal)) < 0.15}
                        onClick={() => walk.setEyeM(Number(eyeVal))}
                      >
                        {label}
                      </button>
                    ))}
                    {[100, 200, 400].map((rad) => (
                      <button
                        key={rad}
                        type="button"
                        className={walk.radiusM === rad ? "p-pill active" : "p-pill"}
                        aria-pressed={walk.radiusM === rad}
                        onClick={() => walk.setRadiusM(rad)}
                      >
                        {rad}m
                      </button>
                    ))}
                    {walk.clickCount > 0 && (
                      <button type="button" className="p-pill" onClick={walk.clear}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="daylight-scrubber view-console-bar mono">
                    {walk.sampleCount > 1 ? (
                      <>
                        <span className="sun-bound">0m</span>
                        <input
                          type="range"
                          className="sun-range"
                          aria-label="Position along walk"
                          min={0}
                          max={Math.max(0, walk.sampleCount - 1)}
                          step={1}
                          value={Math.min(walkAt.index, Math.max(0, walk.sampleCount - 1))}
                          onChange={(event) => {
                            walk.setPlaying(false);
                            walk.seek(Number(event.target.value));
                          }}
                        />
                        <span className="sun-bound">{Math.round(walk.lengthM)}m</span>
                      </>
                    ) : (
                      <span className="sun-bound">
                        {walk.drawing
                          ? "Click ground in 3D view to place walk points"
                          : walk.clickCount > 0
                            ? `Walk path · ${Math.round(walk.lengthM)} m (${walk.sampleCount} samples)`
                            : "Click 'Draw Path' then click ground points"}
                      </span>
                    )}
                    <span className="time-readout-pill">
                      👁 {walk.sampleCount > 1 ? `${Math.round(walkAt.distanceM)}/${Math.round(walk.lengthM)}m · ` : ""}{walk.eyeM.toFixed(1)}m · {walk.radiusM}m
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bottom-bar studio-solar-bar hud-card" role="region" aria-label="Solar and camera controls">
            <button
              type="button"
              className={solar.castShadows ? "sun-pill studio-solar-pill is-active" : "sun-pill studio-solar-pill"}
              aria-pressed={solar.castShadows}
              onClick={() => commitSolar({ ...solar, castShadows: !solar.castShadows })}
            >
              <Sun size={12} strokeWidth={2.2} aria-hidden="true" />
              <span>Equinox · {`${solar.day} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(solar.month ?? 9) - 1] ?? "Sep"}`}</span>
            </button>
            <div className="solar-hours studio-solar-track mono" role="group" aria-label="Solar hour scrubber">
              {[9, 10, 11, 12, 13, 14, 15].map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className={solar.hour === hour ? "h-tick active studio-solar-tick is-active" : "h-tick studio-solar-tick"}
                  aria-label={`Solar time ${String(hour).padStart(2, "0")}:00`}
                  aria-pressed={solar.hour === hour}
                  onClick={() => commitSolar({ ...solar, hour, minute: 0, castShadows: true })}
                >
                  {String(hour).padStart(2, "0")}
                </button>
              ))}
            </div>
            <span className="studio-solar-time mono">
              {String(solar.hour).padStart(2, "0")}:{String(solar.minute).padStart(2, "0")} AEST
            </span>
          </div>
        )}
        {model.terrainError && (
          <p className="stage-error" role="alert">
            {model.terrainError}
          </p>
        )}
      </div>
    </div>
  );
}
