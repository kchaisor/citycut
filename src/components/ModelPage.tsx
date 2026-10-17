import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import { AXO_TERRAIN_EXAGGERATION_RANGE, DEFAULT_AXO_TERRAIN_EXAGGERATION } from "../lib/explodedAxoTerrain";
import { Building2, Copy, Download, DraftingCompass, Info, Sun, Trees, Upload, Wind } from "lucide-react";
import {
  BUILDING_USES,
  BUILDING_USE_META,
  SOURCE_COUNT_KEYS,
  SOURCE_META,
  countSourcesGrouped,
  countUses,
  uniformBuildingColor,
} from "../lib/buildingUse";
import { useColourRevision } from "../lib/useColourRevision";
import { CRS_NOTE, mgaCrs } from "../lib/crsZone";
import {
  commitLineStyles,
  lineStyleBaseline,
  readDrawingStyle,
  resetStoredLineStyles,
  type LineStyles,
} from "../lib/drawingStyle";
import {
  download3dm,
  downloadBlob,
  downloadExplodedAxoAi,
  downloadFigureAi,
  downloadSiteAi,
  downloadViewAi,
  pngFilename,
} from "../lib/download";
import { VIEW3D_EXPORT_TOOLTIP, view3dExportBlocked } from "../lib/view3dExportTab";
import {
  AXO_LAYER_LABELS,
  defaultExplodedAxoGapM,
  defaultExplodedAxoSettings,
  referenceExplodedAxoSettings,
  AXO_REFERENCE_BUILDING_GAP_FACTOR,
  explodedAxoBounds,
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
  availableSidebarSections,
  initialSidebarState,
  reduceSidebar,
  resolveSidebarSection,
  type SidebarSectionId,
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
import { modelStageCreditHtml } from "../lib/dataCredits";
import { VICMAP_ATTRIBUTION } from "../lib/vicmapTrees";
import { COM_TREES_CREDIT, COM_TREES_CREDIT_HTML, COM_TREES_DATASET_URL, comTreesInCut } from "../lib/comTreesCredit";
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
import { ColoursEditor } from "./Colours";
import { ImportMassingPanel } from "./ImportMassingPanel";
import { useImportedMassing } from "./useImportedMassing";
import { snapWhenTogglingIsoFreeRotate } from "../lib/isoFreeRotate";
import { DrawingPlan, type DrawingKind } from "./DrawingPlan";
import { DrawingExplodedAxo } from "./DrawingExplodedAxo";
import { LineStylesEditor } from "./LineStyles";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { SatellitePane } from "./SatellitePane";
import { Scene3D, type SceneExporter } from "./Scene3D";
import type { CameraMemoryRef } from "../lib/cameraMemory";
import { SceneBoundary } from "./SceneBoundary";
import { SolarPanel } from "./SolarPanel";
import { WindPanel } from "./WindPanel";
import { WindRoseOverlay } from "./WindRoseOverlay";
import { fetchWindRoseTable } from "../lib/windFetch";
import type { WindRoseTable } from "../lib/windRose";
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
  readStoredView3dDisplay,
  writeStoredView3dDisplay,
  type View3dDisplaySettings,
} from "../lib/view3dDisplay";

type Tab = "3d" | "drawing" | "satellite";

const SIDEBAR_PANEL_ID = "model-sidebar-panel";
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
  return resolveView(stored, window.location.search);
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
  solar: Sun,
  wind: Wind,
  import: Upload,
  exports: Download,
};

export function ModelPage({ model, onHome, onNewCut }: { model: CityModel; onHome: () => void; onNewCut: () => void }) {
  const [tab, setTab] = useState<Tab>("3d");
  const [drawing, setDrawing] = useState<DrawingKind>("site");
  const [lineStyles, setLineStyles] = useState<LineStyles>(() => readDrawingStyle());
  useColourRevision();
  const uniform = uniformBuildingColor();
  const [figureScale, setFigureScale] = useState<number>(() => preferredFigureScale(model.sideM));
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"3dm" | "png" | "ai-view" | "ai-site" | "ai-figure" | "ai-exploded" | null>(null);
  const [colourByUse, setColourByUse] = useState(
    () => !capturePresetFromSearch(window.location.search).uniformBuildings,
  );
  const [showSource, setShowSource] = useState(false);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const sidebarModelRef = useRef(model);
  useEffect(() => {
    // A new model always opens the sidebar on Model details.
    if (sidebarModelRef.current === model) return;
    sidebarModelRef.current = model;
    dispatchSidebar({ type: "new-model" });
  }, [model]);
  const [planWidth, setPlanWidth] = useState<number | null>(null);
  const [fitCounter, setFitCounter] = useState(0);
  const [planViewport, setPlanViewport] = useState<PlanViewport>(() => planViewportExtent(model.sideM));
  const [axoSettings, setAxoSettings] = useState<ExplodedAxoSettings>(() => defaultExplodedAxoSettings(model.sideM));
  const [explodedViewport, setExplodedViewport] = useState<PlanViewport>(() =>
    explodedAxoViewportExtent(explodedAxoBounds(model, defaultExplodedAxoSettings(model.sideM))),
  );
  const [view, setView] = useState<ViewMemory>(loadView);
  const [snapId, setSnapId] = useState(0);
  // The 3D view unmounts on Drawing/Satellite; this keeps the user's camera for the way back.
  // A new model gets a fresh memory, so a new cut is framed afresh.
  const cameraMemory = useMemo<CameraMemoryRef>(() => ({ current: null }), [model]);
  const [view3dDisplay, setView3dDisplay] = useState<View3dDisplaySettings>(() =>
    readStoredView3dDisplay(window.localStorage),
  );
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
      uniformBuildings: !colourByUse && !showSource,
      colourBySource: showSource,
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

  useEffect(() => {
    if (!windSettings.enabled) return;
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
  }, [windSettings.enabled, model.center.lat, model.center.lon, model.siteAnchor?.lat, model.siteAnchor?.lon]);

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
    setComFootprintFetchError(model.comFootprintFetchError ?? null);
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
      setComFootprints(model.comFootprintPrefetch);
      setComFootprintFetchError(null);
      setComFootprintLoading(false);
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
      setComHeightBuildings(
        annotateUnresolvedZoneDefaults(
          model.buildings,
          model.center,
          comFootprints,
          model.developmentDamRecords ?? [],
        ),
      );
      return;
    }
    if (comFootprints.length === 0 || model.buildings.length === 0) {
      setComHeightBuildings(null);
      return;
    }
    const controller = new AbortController();
    const source = model.buildingsWithoutCom ?? model.buildings;
    setComHeightsApplyFailed(false);
    runComBuildingHeightsInWorker(source, comFootprints, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        // CoM first, then DAM floors on what CoM did not measure, then estimate labels.
        setComHeightBuildings(
          resolveBuildingHeightsAfterCom(
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
    return () => controller.abort();
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
      model.buildingsWithoutCom
        ? resolveBuildingHeightsAfterCom(
            model.buildingsWithoutCom,
            model.center,
            [],
            model.developmentDamRecords ?? [],
          )
        : stampPlainZoneDefaultLabels(model.buildings),
    [model.buildings, model.buildingsWithoutCom, model.center, model.developmentDamRecords],
  );
  const baseBuildings = useMemo(() => {
    if (comHeightBuildings) return comHeightBuildings;
    if (model.comBuildingHeightsApplied) return model.buildings;
    return fallbackBuildings;
  }, [comHeightBuildings, fallbackBuildings, model.buildings, model.comBuildingHeightsApplied]);

  const overrideResult = useMemo(
    () => applyHeightOverrides(baseBuildings, heightOverrideStore, model.center),
    [baseBuildings, heightOverrideStore, model.center],
  );

  useEffect(() => {
    setUnmatchedEdits(overrideResult.unmatchedCount);
    clearPlanShadowCache();
  }, [overrideResult]);

  const hiddenMatch = useMemo(
    () => matchHiddenBuildings(overrideResult.buildings, hiddenStore, model.center),
    [overrideResult.buildings, hiddenStore, model.center],
  );
  const visibleBuildings = useMemo(
    () => filterHiddenBuildings(overrideResult.buildings, new Set(hiddenMatch.keys())),
    [overrideResult.buildings, hiddenMatch],
  );

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

  /**
   * Drawing tab and its .ai exports: the display model (hidden buildings already gone) plus plan
   * footprints of visible imported massing. The 3D view and .3dm keep displayModel, so nothing is drawn twice.
   */
  const drawingModel = useMemo(
    () =>
      massing.drawingBuildings.length
        ? { ...displayModel, buildings: [...displayModel.buildings, ...massing.drawingBuildings] }
        : displayModel,
    [displayModel, massing.drawingBuildings],
  );

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
    const comDone = comHeightBuildings != null || comFootprints.length === 0;
    if (comDone && heightPerfRef.current.comAppliedMs == null) {
      heightPerfRef.current.comAppliedMs = performance.now() - heightPerfRef.current.modelOpenMs;
    }
  }, [comHeightBuildings, comFootprints.length]);

  useEffect(() => {
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
  const sideKm = model.sideM / 1000;
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
  const items: SidebarItem[] = sectionIds.map((id, index) => {
    const Icon = SECTION_ICONS[id];
    return {
      id,
      label: SIDEBAR_SECTION_LABELS[id],
      icon: <Icon {...iconProps} />,
      groupStart: index === 1 || id === "import",
    };
  });
  const open: SidebarSectionId = resolveSidebarSection(sidebar.section, sectionIds);

  function selectSection(id: string) {
    dispatchSidebar({ type: "select", id: resolveSidebarSection(id, sectionIds) });
    setSidebarCollapsed(false);
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
        uniformBuildings: !colourByUse && !showSource,
        colourBySource: showSource,
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

  async function saveSiteAi() {
    setExportError(null);
    setBusy("ai-site");
    try {
      await downloadSiteAi(drawingModel, figureScale, lineStyles, sitePlanExportOptions());
    } catch {
      setExportError("The site plan could not be written.");
    } finally {
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

  function moveAxoLayer(id: AxoLayerId, direction: -1 | 1) {
    setAxoSettings((prev) => {
      const order = [...prev.layerOrder];
      const index = order.indexOf(id);
      if (index < 0) return prev;
      const next = index + direction;
      if (next < 0 || next >= order.length) return prev;
      order.splice(index, 1);
      order.splice(next, 0, id);
      return { ...prev, layerOrder: order };
    });
  }

  async function saveViewAi() {
    setExportError(null);
    setBusy("ai-view");
    try {
      const exporter = exportRef.current;
      if (!exporter) throw new Error("The 3D view is not ready.");
      await downloadViewAi(displayModel, exporter.shot(), {
        uniformBuildings: !colourByUse && !showSource,
        colourBySource: showSource,
        whiteCard: view3dDisplay.whiteCard,
        showOutlines: view3dDisplay.showOutlines,
        showContours: view3dDisplay.showContours3d,
        hideTrees: view3dDisplay.hideTrees,
      });
    } catch (error) {
      console.error(error);
      setExportError("The 3D view could not be written.");
    } finally {
      setBusy(null);
    }
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
  const view3dExportDisabled = view3dExportBlocked(tab);
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

  // #87's 3D display modes, housed as switches: Buildings › Display, or Drawing when the model has no buildings.
  const displaySwitches = (
    <div className="display-switches" role="group" aria-label="3D display">
      {(
        [
          ["whiteCard", "White card"],
          ["showOutlines", "Outlines"],
          ["showContours3d", "Contours in 3D"],
          ["hideTrees", "Hide trees"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="check-field">
          <input
            type="checkbox"
            checked={view3dDisplay[key]}
            onChange={(event) => commitView3dDisplay({ ...view3dDisplay, [key]: event.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );

  const hint =
    tab === "3d"
      ? view.projection === "plan"
        ? "Drag to pan · scroll to zoom · north up · orthographic"
        : view.projection === "perspective"
          ? "Drag to orbit · scroll to zoom · right-drag to pan"
          : view.freeRotate
            ? "Drag to orbit · scroll to zoom · right-drag to pan · not true isometric"
            : "Drag to pan · scroll to zoom"
      : tab === "drawing"
        ? "Scroll to zoom · drag to pan · double-click to fit"
        : "Satellite preview of this frame. It is not included in the downloads.";

  return (
    <div className="model">
      <h1 className="sr-only">Your model is ready.</h1>
      <div
        className={`${
          tab === "drawing" ? "viewport is-drawing" : tab === "satellite" ? "viewport is-satellite" : "viewport"
        }${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      >
        {tab === "3d" && (
          <div className="fill">
            {model.heightSourceLoadWarnings?.map((line) => (
              <p key={line} className="height-source-notice" role="status">
                {line}
              </p>
            ))}
            <SceneBoundary>
              <Scene3D
                model={displayModel}
                uniformBuildings={!colourByUse && !showSource}
                colourBySource={showSource}
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
                cameraMemory={cameraMemory}
                display={view3dDisplay}
                importedMassing={massing.group}
                onScenePoint={massing.onScenePoint}
              />
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
                fitCounter={fitCounter}
              />
            ) : (
              <DrawingPlan
                model={drawingModel}
                kind={drawing}
                onScale={onScale}
                lineStyle={lineStyles}
                planScale={figureScale}
                heliodon={heliodonDiagramExport()}
                castShadows={solar.castShadows}
                shadowInput={planShadowInput()}
                uniformBuildings={!colourByUse && !showSource}
                colourBySource={showSource}
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
            items={items}
            active={open}
            collapsed={sidebarCollapsed}
            title={SIDEBAR_SECTION_LABELS[open]}
            onHome={onHome}
            showNewCut
            onNewCut={onNewCut}
            onSelect={selectSection}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            status={
              open === "summary" ? (
                <span className="sidebar-status">
                  <i className="status-dot is-ready" aria-hidden="true" />
                  Ready
                </span>
              ) : open === "import" ? (
                <span className="sidebar-status">
                  {massing.imported.length} model{massing.imported.length === 1 ? "" : "s"}
                </span>
              ) : open === "buildings" ? (
                <span className="sidebar-status">
                  {comMeasuredHeightCount.toLocaleString()} of {displayModel.buildings.length.toLocaleString()} measured
                </span>
              ) : null
            }
            footer={
              open === "summary" ? (
                <button type="button" className="sidebar-primary" onClick={() => selectSection("exports")}>
                  <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                  Export model
                </button>
              ) : open === "buildings" ? (
                <p className="sidebar-foot-note">
                  {overrideResult.manualCount.toLocaleString()} manual height
                  {overrideResult.manualCount === 1 ? "" : "s"}
                </p>
              ) : null
            }
          >
            <div className="drawer-section" hidden={open !== "summary"}>
              <div className="sidebar-hero">
                <p className="sidebar-place">{model.placeLabel}</p>
                <p className="sidebar-sub">
                  {cutSizeLabel(model.sideM, model.frameShape ?? "square")} {model.frameShape === "circle" ? "circle" : "square"} ·{" "}
                  {(sideKm * sideKm).toFixed(2)} km²
                </p>
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
              </div>
              <section className="sidebar-group">
                <h3 className="sidebar-gh">In this model</h3>
                <dl className="stats">
                  {model.layers.buildings && (
                    <div>
                      <dt>Buildings</dt>
                      <dd>{model.buildings.length.toLocaleString()}</dd>
                    </div>
                  )}
                  {model.layers.trees && (
                    <div>
                      <dt>Trees</dt>
                      <dd>{model.trees.length.toLocaleString()}</dd>
                    </div>
                  )}
                  {model.layers.roads && (
                    <div>
                      <dt title="Clipped centerline length of roads, paths, and rail">Roads</dt>
                      <dd>
                        {formatLengthKm(model.roadKm)}
                        <small>km</small>
                      </dd>
                    </div>
                  )}
                  {model.terrain && (
                    <div>
                      <dt>Elevation</dt>
                      <dd>
                        {model.terrain.min.toFixed(0)}–{model.terrain.max.toFixed(0)}
                        <small>m</small>
                      </dd>
                    </div>
                  )}
                </dl>
                {model.terrainError && <p className="error">{model.terrainError}</p>}
                {model.terrainNotice && <p className="legend-note terrain-notice">{model.terrainNotice}</p>}
              </section>
              {showBuildings && heightBar.total > 0 && (
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Building heights</h3>
                    <span>{Math.round((heightBar.measured / heightBar.total) * 100)}% measured</span>
                  </div>
                  <div className="height-bar" aria-hidden="true">
                    {heightBar.parts.map((part) =>
                      part.value > 0 ? (
                        <i
                          key={part.id}
                          className={`height-bar-${part.id}`}
                          style={{ flexGrow: part.value }}
                        />
                      ) : null,
                    )}
                  </div>
                  <ul className="height-bar-legend">
                    {heightBar.parts.map((part) =>
                      part.value > 0 ? (
                        <li key={part.id}>
                          <i className={`height-bar-${part.id}`} />
                          <span>{part.label}</span>
                          <b>{part.value.toLocaleString()}</b>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </section>
              )}
              <section className="sidebar-group">
                <div className="sidebar-gh">
                  <h3>Data sources</h3>
                  <span>
                    {sourcesLoaded.loaded} of {sourcesLoaded.total} loaded
                  </span>
                </div>
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
              </section>
            </div>

            {showBuildings && (
              <div className="drawer-section legend" hidden={open !== "buildings"}>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Colour by</h3>
                  <div className="segmented" role="group" aria-label="Colour buildings by">
                    <button
                      type="button"
                      data-autofocus="true"
                      aria-pressed={colourByUse && !showSource}
                      onClick={() => {
                        setShowSource(false);
                        setColourByUse(true);
                      }}
                    >
                      Use
                    </button>
                    <button type="button" aria-pressed={showSource} onClick={() => setShowSource(true)}>
                      Source
                    </button>
                    <button
                      type="button"
                      aria-pressed={!colourByUse && !showSource}
                      onClick={() => {
                        setShowSource(false);
                        setColourByUse(false);
                      }}
                    >
                      None
                    </button>
                  </div>
                  {solar.showPath && tab === "3d" && (
                    <p className="legend-note">Buildings render white on screen while sun path is on; exports keep normal colours.</p>
                  )}
                </section>
                <section className="sidebar-group">
                  <div className="sidebar-gh">
                    <h3>Use</h3>
                    <span>{model.buildings.length.toLocaleString()}</span>
                  </div>
                  <ul className="legend-two">
                    {BUILDING_USES.filter((use) => useCounts[use] > 0).map((use) => (
                      <li key={use}>
                        <i
                          style={{
                            background: colourByUse && !showSource ? BUILDING_USE_META[use].color : uniform,
                          }}
                        />
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
                  <h3 className="sidebar-gh">Display</h3>
                  {displaySwitches}
                </section>
                <section className="sidebar-group">
                  <h3 className="sidebar-gh">Manual heights</h3>
                  <HiddenBuildingsPanel
                    hidden={[...hiddenMatch.values()]}
                    onShow={(entry) => persistHidden(showHiddenEntry(hiddenStore, entry))}
                    onShowAll={() => persistHidden(showAllInCut(hiddenStore, hiddenMatch.values()))}
                  />
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
            )}

            {showTrees && (
              <div className="drawer-section tree-sizes" hidden={open !== "trees"}>
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
            )}

            <div className="drawer-section" hidden={open !== "drawing"}>
              <div className="tabs" role="tablist" aria-label="Model views">
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
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "3d" && (
                <div className="projection-block">
                  <p className="kicker">Projection</p>
                  <div className="plan-switch" role="group" aria-label="Projection">
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
                  {!showBuildings && displaySwitches}
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
                </div>
              )}
              <div className="plan-switch" role="group" aria-label="Drawing type">
                <button
                  type="button"
                  aria-pressed={drawing === "site"}
                  onClick={() => {
                    setDrawing("site");
                    setTab("drawing");
                  }}
                >
                  Site plan
                </button>
                <button
                  type="button"
                  aria-pressed={drawing === "figure-ground"}
                  onClick={() => {
                    setDrawing("figure-ground");
                    setTab("drawing");
                  }}
                >
                  Figure-ground
                </button>
                <button
                  type="button"
                  aria-pressed={drawing === "exploded-axo"}
                  onClick={() => {
                    setDrawing("exploded-axo");
                    setTab("drawing");
                  }}
                >
                  Exploded axo
                </button>
              </div>
              {drawing === "exploded-axo" && (
                <div className="axo-controls">
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
                  <p className="kicker">Layers</p>
                  <ul className="axo-layer-list">
                    {axoSettings.layerOrder.map((id, index) => (
                      <li key={id}>
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
                        <span className="axo-layer-move">
                          <button type="button" className="ghost" disabled={index === 0} aria-label={`Move ${AXO_LAYER_LABELS[id]} up`} onClick={() => moveAxoLayer(id, -1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            disabled={index === axoSettings.layerOrder.length - 1}
                            aria-label={`Move ${AXO_LAYER_LABELS[id]} down`}
                            onClick={() => moveAxoLayer(id, 1)}
                          >
                            ↓
                          </button>
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
                        setAxoSettings((prev) => ({ ...prev, gapM: Number(event.target.value) }))
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
                </div>
              )}
              <label className="scale-field">
                Plan scale
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
              <LineStylesEditor
                style={lineStyles}
                baseline={lineStyleBaseline()}
                onChange={(next) => setLineStyles(commitLineStyles(next, lineStyleBaseline()))}
                onReset={() => setLineStyles(resetStoredLineStyles())}
              />
              <ColoursEditor onChange={() => setLineStyles(readDrawingStyle())} />
              {tab === "drawing" && (
                <div className="field">
                  <div className="field-head">
                    <p className="kicker">View width</p>
                    <strong>{planWidth === null ? "—" : `${Math.round(planWidth)} m`}</strong>
                  </div>
                  <p className="field-note">
                    Width of the drawing in view. The frame is {Math.round(model.sideM)} m on a side.
                  </p>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => {
                      if (drawing === "exploded-axo") {
                        setExplodedViewport(
                          explodedAxoViewportExtent(explodedAxoBounds(displayModel, axoSettings)),
                        );
                      } else {
                        setPlanViewport(planViewportExtent(displayModel.sideM));
                      }
                      setFitCounter((token) => token + 1);
                    }}
                  >
                    Fit frame
                  </button>
                </div>
              )}
              {tab === "satellite" && (
                <p className="field-note">Satellite is a preview of this frame. It is not included in the downloads.</p>
              )}
            </div>

            <div className="drawer-section" hidden={open !== "solar"}>
              <SolarPanel
                embedded
                settings={solar}
                onChange={commitSolar}
                sideM={model.sideM}
                site={{ lat: model.center.lat, lon: model.center.lon }}
              />
            </div>

            <div className="drawer-section" hidden={open !== "wind"}>
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

            <div className="drawer-section" hidden={open !== "import"}>
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

            <div className="drawer-section" hidden={open !== "exports"}>
              <div className="exports">
                <article className="card">
                  <div>
                    <h3>
                      PNG image <span>.png</span>
                    </h3>
                    <p>The current 3D view, in perspective or isometric, at twice the canvas resolution.</p>
                  </div>
                  <button
                    className="ghost"
                    type="button"
                    data-autofocus="true"
                    disabled={busy !== null || view3dExportDisabled}
                    title={view3dExportDisabled ? VIEW3D_EXPORT_TOOLTIP : undefined}
                    onClick={savePng}
                    aria-label="Download PNG"
                  >
                    {busy === "png" ? "Preparing…" : "Download"}
                  </button>
                </article>
                <article className="card">
                  <div>
                    <h3>
                      Rhino <span>.3dm</span>
                    </h3>
                    <p>
                      {buildingsAsMesh
                        ? "Buildings as meshes"
                        : "Buildings as closed extrusions, one per part"}
                      ; terrain, roads and trees as meshes. {crs.name}, metres, Z-up, plus a FigureGround layer.
                    </p>
                  </div>
                  <button className="ghost" type="button" disabled={busy !== null} onClick={save3dm} aria-label="Download Rhino">
                    {busy === "3dm" ? "Preparing…" : "Download"}
                  </button>
                </article>
                <label className="check-field rhino-mesh-option">
                  <input
                    type="checkbox"
                    checked={buildingsAsMesh}
                    onChange={(event) => setBuildingsAsMesh(event.target.checked)}
                  />
                  Buildings as mesh
                </label>
                <article className="card">
                  <div>
                    <h3>
                      3D view <span>.ai</span>
                    </h3>
                    <p>The current camera as vectors: filled faces, visible edges, and simplified trees. Not to scale.</p>
                  </div>
                  <button
                    className="ghost"
                    type="button"
                    disabled={busy !== null || view3dExportDisabled}
                    title={view3dExportDisabled ? VIEW3D_EXPORT_TOOLTIP : undefined}
                    onClick={saveViewAi}
                    aria-label="Download 3D view Illustrator"
                  >
                    {busy === "ai-view" ? "Preparing…" : "Download"}
                  </button>
                </article>
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
                <article className="card">
                  <div>
                    <h3>
                      Site plan <span>.ai</span>
                    </h3>
                    <p>
                      True scale at 1:{figureScale}. Building outlines, the road fill and kerb, contours, and the
                      frame use the line styles on the sheet.
                    </p>
                  </div>
                  <button className="ghost" type="button" disabled={busy !== null} onClick={saveSiteAi} aria-label="Download site plan Illustrator">
                    {busy === "ai-site" ? "Preparing…" : "Download"}
                  </button>
                </article>
                <article className="card">
                  <div>
                    <h3>
                      Figure-ground <span>.ai</span>
                    </h3>
                    <p>Black footprints on white, with the footpath strips, true scale. A3 landscape or portrait, whichever fits the frame.</p>
                  </div>
                  <button className="ghost" type="button" disabled={busy !== null} onClick={saveFigureAi} aria-label="Download figure-ground Illustrator">
                    {busy === "ai-figure" ? "Preparing…" : "Download"}
                  </button>
                </article>
                <article className="card">
                  <div>
                    <h3>
                      Exploded axo <span>.ai</span>
                    </h3>
                    <p>
                      Stacked isometric layers at 1:{figureScale}, with guides and labels. Satellite is noted in the file when imagery is not embedded.
                    </p>
                  </div>
                  <button className="ghost" type="button" disabled={busy !== null} onClick={saveExplodedAxoAi} aria-label="Download exploded axo Illustrator">
                    {busy === "ai-exploded" ? "Preparing…" : "Download"}
                  </button>
                </article>
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
        {model.terrainError && (
          <p className="stage-error" role="alert">
            {model.terrainError}
          </p>
        )}
        {!model.terrainError && model.terrainNotice && (
          <p className="stage-error terrain-notice" role="status">
            {model.terrainNotice}
          </p>
        )}
        <p className="viewport-hint">{hint}</p>
        <p
          className="stage-attrib"
          dangerouslySetInnerHTML={{
            __html: modelStageCreditHtml({
              windOn: windSettings.enabled,
              satelliteOn: tab === "satellite",
              comHeightsHtml: comHeightsMeasuredOn
                ? `Building heights: <a href="${COM_BUILDING_HEIGHTS_DATASET_URL}" target="_blank" rel="noopener noreferrer">2023 Building Footprints © City of Melbourne</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.`
                : null,
              comTreesHtml: comTreesInCut(model) ? COM_TREES_CREDIT_HTML : null,
              cadastreOn: drawing === "exploded-axo" && tab === "drawing" && axoSettings.layerVisible.cadastre,
              contourHtml:
                model.contourLayer && model.contourLayer.source !== "dem"
                  ? `<a href="${model.contourLayer.datasetUrl ?? "https://discover.data.vic.gov.au/dataset/vicmap-elevation-contour-line-1-to-5-metres-covering-metropolitan-melbourne"}" target="_blank" rel="noopener noreferrer">Contours</a> every ${model.contourLayer.interval} m.`
                  : null,
            }),
          }}
        />
      </div>
    </div>
  );
}
