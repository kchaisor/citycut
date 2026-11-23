import { sunStudyCasterModel, sunStudyMutedOn, sunStudyShadowCasters, SunStudyDate } from "../../lib/sunStudyPlan";

import { sunStudyLayersFor } from "../useSunStudyShadows";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { handleModelKeyDown, type ModelShortcutAction } from "../../lib/modelKeyboard";
import { registerModelKeyboardBridge } from "../../lib/modelKeyboardBridge";
import { viewportIsNarrow } from "../../lib/panelCollapse";
import * as THREE from "three";import { BUILDING_USES, BUILDING_USE_META, countSourcesGrouped, countUses, uniformBuildingColor } from "../../lib/buildingUse";

import { commitColour, getColour, resetStoredColours } from "../../lib/colours";
import { viewStyleFootpathChipColor, viewStyleRoadChipColor } from "../../lib/viewStyle3d";
import { useColourRevision } from "../../lib/useColourRevision";import { mgaCrs } from "../../lib/crsZone";

import { planHeliodonForExport } from "../../lib/planHeliodonExport";
import {
  applyOverrides,
  readDrawingStyle,
  readStoredOverrides,
  type LineStyles,
} from "../../lib/drawingStyle";
import {
  download3dm,
  downloadBlob,
  downloadExplodedAxoAi,
  downloadFigureAi,
  downloadIsometricAi,
  downloadIsometricSvg,
  downloadSiteAi,
  downloadSite3dm,
  downloadSiteSvg,
  downloadFigureSvg,
  downloadSunStudyZip,
  pngFilename,
} from "../../lib/download";
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
} from "../../lib/explodedAxo";
import {
  explodedAxoViewportExtent,
  planViewportExtent,
  planViewportForBounds,
  type PlanViewport,
} from "../../lib/planViewport";
import { FIGURE_SCALES, preferredFigureScale, sheetFitMessageForModel } from "../../lib/figureGround";
import { A3_DRAWING_SCALES, a3GroundMetres } from "../../lib/cutSpec";
import {
  fetchComBuildingFootprints,
  intersectsComCity,
  paddedComFetchBounds,
  type ComBuildingFootprint,
} from "../../lib/comBuildingHeights";
import { countBuildingsWithComHeightTier } from "../../lib/comBuildingHeightsCount";
import { runComBuildingHeightsInWorker } from "../../lib/comBuildingHeightsWorkerClient";
import {
  clearLegacyComBuildingHeightsPreference,
  comBuildingHeightsStatus,
  comBuildingHeightsStatusNote,
} from "../../lib/comBuildingHeightsStatus";
import { resolveBuildingHeightsAfterCom } from "../../lib/buildingHeightPipeline";import { formatLengthKm } from "../../lib/geo";

import { useSidebarCollapsed } from "../../lib/sidebarCollapse";
import { cutSizeLabel } from "../../lib/placeLabel";import { SIDEBAR_SECTION_LABELS, availableSidebarSections, initialSidebarState, isRightSidebarSection, reduceSidebar, resolveLeftSidebarSection, resolveRightSidebarSection, resolveSidebarSection, LeftSidebarSectionId, RightSidebarSectionId, NO_ANALYSES, isSiteAnalysisKind, withAnalysisOn, type ActiveAnalyses, type SiteAnalysisKind } from "../../lib/sidebarSections";
import { buildDataSources, countLoaded } from "../../lib/dataSources";
import { useWikidataLandmarks } from "../useWikidataLandmarks";
import {
  LANDMARK_LABELS_DEFAULT_ON,
  landmarkLabelSources,
  landmarksByBuilding,
} from "../../lib/landmarkLabels";
import type { WikidataLandmark } from "../../lib/wikidataLandmarks";
import type { LandmarkScreenState } from "../LandmarkLabelProjector";

import { countTreeCrowns } from "../../lib/treeMassing";
import { capturePresetFromSearch } from "../../lib/captureQuery";import { qaModeFromSearch } from "../../lib/qaCameraBridge";
import { writeStoredView, writeViewSearch, ViewMemory } from "../../lib/viewMemory";
import { treeTierCounts } from "../../lib/trees";

import { clearPlanShadowCache } from "../../lib/buildingShadows";
import { useWindPlan } from "../useWindPlan";
import { designWindsFor, findDesignWind } from "../../lib/windDesignWinds";
import { windObstacleModel, withImportedOutlines } from "../../lib/windObstacleModel";
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
} from "../../lib/heightOverrides";
import {
  annotateUnresolvedZoneDefaults,
  heightTierLabel,
  stampPlainZoneDefaultLabels,
} from "../../lib/buildingHeightResolve";
import { countBuildingHeightTiers, LIDAR_NO_DATA_LINE } from "../../lib/lidarTierStatus";
import { buildCityGroup, disposeObject } from "../../lib/buildCity";
import { openRing, toLocal } from "../../lib/geo";
import { interiorPoint, pointInPolygon } from "../../lib/useCascade";
import type { BuildingUse, CityModel } from "../../types";
import type { InspectHudScreen } from "../InspectHudProjector";
import { inspectHudPlacement, measureInspectHudDock } from "../../lib/inspectHudLayout";
import {
  sceneSelectionBuildingId,
  type SceneInspectWorld,
  type SceneSelection,
} from "../../lib/sceneInspectPick";
import {
  filterHiddenBuildings,
  hideBuildings,
  matchHiddenBuildings,
  readStoredHiddenBuildings,
  showAllInCut,
  showHiddenEntry,
  writeStoredHiddenBuildings,
  type HiddenBuildingStore,
} from "../../lib/hiddenBuildings";
import { nextHideSelection } from "../../lib/hideSelection";
import { useImportedMassing } from "../useImportedMassing";import { DrawingKind } from "../DrawingPlan";

import { isometricDrawingBounds } from "../../lib/isometricDrawing";import { SidebarItem } from "../Sidebar";
import { SceneExporter } from "../Scene3D";


import type { CameraMemoryRef } from "../../lib/cameraMemory";import { ExportBusy } from "../../lib/exportTiles";

import { useWalkPlayback, useWalkViewshed } from "../useWalkViewshed";

import { loadSiteWind } from "../../lib/windLoad";
import type { SiteWindSelection } from "../../lib/windRoseData";
import { sectorCenterDeg, sectorIndex } from "../../lib/windRose";
import { analyzeSiteWind, seasonRecord } from "../../lib/windRoseStats";

import { daylightWindowMinutes, sunAtMelbourneLocal } from "../../lib/solar";
import {
  windSettingsForModelOpen,
  writeStoredWindSettings,
  type WindViewSettings,
} from "../../lib/windState";
import { useWindStreakMotion } from "../../lib/windStreakMotion";
import { prevailingStreams } from "../../lib/windPrevailingStreams";
import { solarSettingsForActiveAnalysis, windDiagramActive } from "../../lib/solarStudyView";
import { siteIntelAutoFolded } from "./windRoseCard";
import {
  analysisCardsOn,
  anyAnalysisCardOn,
  initialAnalysisCardFocus,
  nextAnalysisCardFocus,
  toggleAnalysisCard as focusAnalysisCard,
} from "../../lib/analysisCards";
import type { SitePlanExportOptions } from "../../lib/aiPlan";
import type { PlanShadowInput } from "../../lib/buildingShadows";
import type { HeliodonDiagramExportOptions, HeliodonGroundExportOptions } from "../../lib/heliodonDiagram";
import { resolveSunDomeRadiusM, sunDomeRange, writeStoredHeliodonRadiusFactor } from "../../lib/heliodonRadius";
import type { SolarViewSettings } from "../SolarHeliodon";
import {
  isLayer3dVisible,
  setLayer3dVisible,
  view3dDisplayForModelOpen,
  writeStoredView3dDisplay,
  type Layer3dId,
  type View3dDisplaySettings,
} from "../../lib/view3dDisplay";
import { readStoredRenderQuality, writeStoredRenderQuality, type RenderQuality } from "../../lib/renderQuality";

import { shouldShowIntroBridgePill } from "./shouldShowIntroBridgePill";
import { loadView } from "./loadModelView";
import { initialAnalyses, initialSolarSettings } from "./initialSolarSettings";
import { useSunHoursGround } from "../useSunHoursGround";
import { sunHoursModel } from "../../lib/sunHoursBuildings";
import { sunHoursPlanLayers } from "../../lib/sunHoursPlanLayers";
import { SOLAR_SLIDER_END_MIN, SOLAR_SLIDER_START_MIN, clampSolarSliderMinutes } from "../../lib/solarSlider";
import {
  SECTION_ICONS,
  iconProps,
  type Tab,
} from "./modelPageConstants";

export type ModelPageProps = {
  model: import("../../types").CityModel;
  onHome: () => void;
  onNewCut: () => void;
  commandBarOpen?: boolean;
};

const SITE_INTEL_STORAGE_KEY = "citycut.siteIntelligence";

export function useModelPage({
  model,
  onHome,
  onNewCut,
  commandBarOpen = false,
}: ModelPageProps) {
  const [tab, setTab] = useState<Tab>("3d");
  const [drawing, setDrawing] = useState<DrawingKind>("site");
  const [analyses, setAnalyses] = useState<ActiveAnalyses>(() => initialAnalyses(window.location.search));
  const [shortcutCheatsheetOpen, setShortcutCheatsheetOpen] = useState(false);
  const [lineStyles, setLineStyles] = useState<LineStyles>(() => readDrawingStyle());
  useColourRevision();
  const uniform = uniformBuildingColor();
  const planScaleOptions = useMemo(
    () => (model.frameShape === "a3" ? [...A3_DRAWING_SCALES] : [...FIGURE_SCALES]),
    [model.frameShape],
  );
  const [figureScale, setFigureScale] = useState<number>(() => {
    if (model.frameShape === "a3") {
      if (model.cutScale) return model.cutScale;
      const widthM = model.widthM ?? model.sideM;
      const heightM = model.heightM ?? model.sideM;
      const orientation = model.cutOrientation ?? "landscape";
      for (const scale of A3_DRAWING_SCALES) {
        const ground = a3GroundMetres(scale, orientation);
        if (
          Math.abs(ground.widthM - widthM) < 0.5 &&
          Math.abs(ground.heightM - heightM) < 0.5
        ) {
          return scale;
        }
      }
    }
    return preferredFigureScale(model.sideM);
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportBusy>(null);
  const [topbarExportOpen, setTopbarExportOpen] = useState(false);
  const [topbarLayout, setTopbarLayout] = useState<"centered" | "flow">("flow");
  const topbarExportRef = useRef<HTMLDivElement>(null);
  const topbarExportTriggerRef = useRef<HTMLButtonElement>(null);
  const cutDimLabel = useMemo(
    () =>
      cutSizeLabel(model.sideM, model.frameShape ?? "square", {
        widthM: model.widthM,
        heightM: model.heightM,
        scale: model.cutScale as import("../../lib/cutSpec").A3DrawingScale | undefined,
        orientation: model.cutOrientation,
      }),
    [model.sideM, model.frameShape, model.widthM, model.heightM, model.cutScale, model.cutOrientation],
  );
  useEffect(() => {
    if (!topbarExportOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (topbarExportRef.current?.contains(event.target as Node)) return;
      setTopbarExportOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTopbarExportOpen(false);
      topbarExportTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [topbarExportOpen]);
  const [sunStudyProgress, setSunStudyProgress] = useState<string | null>(null);
  const [colourByUse, setColourByUse] = useState(() => {
    const preset = capturePresetFromSearch(window.location.search);
    if (preset.uniformBuildings) return false;
    return false;
  });
  const [showSource, setShowSource] = useState(false);
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
  const [siteIntelOpen, setSiteIntelOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SITE_INTEL_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SITE_INTEL_STORAGE_KEY, siteIntelOpen ? "on" : "off");
    } catch {
      return;
    }
  }, [siteIntelOpen]);
  const sidebarModelRef = useRef(model);
  useEffect(() => {
    if (sidebarModelRef.current === model) return;
    sidebarModelRef.current = model;
    dispatchSidebar({ type: "new-model" });
    setAnalyses(NO_ANALYSES);
    setWindStreaksOn(false);
    setWindSettings(() => {
      const nextWind = windSettingsForModelOpen(window.localStorage);
      writeStoredWindSettings(window.localStorage, nextWind);
      return nextWind;
    });
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
  const cameraMemory = useMemo<CameraMemoryRef>(() => ({ current: null }), [model]);
  const introPlayed = useMemo<{ current: string | null }>(() => ({ current: null }), [model]);
  const [view3dDisplay, setView3dDisplay] = useState<View3dDisplaySettings>(() => {
    const next = view3dDisplayForModelOpen(window.localStorage);
    writeStoredView3dDisplay(window.localStorage, next);
    return next;
  });
  const [renderQuality, setRenderQuality] = useState<RenderQuality>(() => readStoredRenderQuality(window.localStorage));
  const commitRenderQuality = useCallback((next: RenderQuality) => {
    setRenderQuality(next);
    writeStoredRenderQuality(window.localStorage, next);
  }, []);
  const [windSettings, setWindSettings] = useState<WindViewSettings>(() => {
    const next = windSettingsForModelOpen(window.localStorage);
    writeStoredWindSettings(window.localStorage, next);
    return next;
  });
  const [siteWind, setSiteWind] = useState<SiteWindSelection | null>(null);
  const [windNote, setWindNote] = useState<string | null>(null);
  const windMotion = useWindStreakMotion();
  const [windStreaksOn, setWindStreaksOn] = useState(false);
  const [solar, setSolar] = useState<SolarViewSettings>(() =>
    initialSolarSettings(window.location.search, window.localStorage),
  );

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

  function heliodonPlanDiagramBase(): HeliodonDiagramExportOptions {
    return {
      ...planShadowInput(),
      sideM: model.sideM,
      radiusFactor: solar.radiusFactor,
    };
  }

  function planHeliodonForSiteExport(): HeliodonDiagramExportOptions | null {
    const direct = heliodonDiagramExport();
    if (direct) return direct;
    return planHeliodonForExport({
      showPath: solar.showPath,
      sunStudyDate,
      diagram: heliodonPlanDiagramBase(),
    });
  }

  function sitePlanExportOptions(): SitePlanExportOptions {
    return {
      heliodon: planHeliodonForSiteExport(),
      shadows: planShadowInput(),
      castShadows: solar.castShadows,
      uniformBuildings: !colourByUse && !showSource,
      colourBySource: showSource,
      highlightManual: showManualEdits && overrideResult.manualCount > 0,
      sunStudyDate: solar.sunStudy ? sunStudyDate : null,
      sunStudyMuted: solar.sunStudy ? sunStudyMutedOn(solar.sunStudy, solar.sunStudyMuted) : undefined,
      sunStudySelected: solar.sunStudy ? sunStudySelected : undefined,
      wind:
        windSettings.enabled && siteWind
          ? { selection: siteWind, period: windSettings.period }
          : null,
      landmarkLabels: drawingLandmarkSources,
    };
  }

  function commitWind(next: WindViewSettings) {
    writeStoredWindSettings(window.localStorage, next);
    setWindSettings(next);
  }

  const wantWindTable = windSettings.enabled || analyses.wind;
  useEffect(() => {
    if (!wantWindTable) return;
    let cancelled = false;
    const lat = model.siteAnchor?.lat ?? model.center.lat;
    const lon = model.siteAnchor?.lon ?? model.center.lon;
    loadSiteWind(lat, lon).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSiteWind(result.selection);
        setWindNote(null);
      } else {
        setSiteWind(null);
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
  const [hideSelection, setHideSelection] = useState<number[]>([]);
  const [sceneSelection, setSceneSelection] = useState<SceneSelection | null>(null);
  const [inspectHudScreen, setInspectHudScreen] = useState<InspectHudScreen | null>(null);
  const [compassHeadingDeg, setCompassHeadingDeg] = useState(0);

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
        setSceneSelection({
          kind: "building",
          buildingId,
          clientX: 640,
          clientY: 400,
          world: { east: 0, north: 0, up: 10 },
        });
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
        setSceneSelection({
          kind: "building",
          buildingId: pick.id,
          clientX: 640,
          clientY: 400,
          world: { east: 0, north: 0, up: pick.height * 0.5 },
        });
        return pick.id;
      },
      clearHeightSelection() {
        setSceneSelection(null);
        setInspectHudScreen(null);
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
        const at = interiorPoint(pick.ring, pick.holes);
        setSceneSelection({
          kind: "building",
          buildingId: pick.id,
          clientX: 24,
          clientY: 72,
          world: { east: at[0], north: at[1], up: pick.height * 0.5 },
        });
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
        const at = interiorPoint(pick.ring, pick.holes);
        setSceneSelection({
          kind: "building",
          buildingId: pick.id,
          clientX: 72,
          clientY: 88,
          world: { east: at[0], north: at[1], up: pick.height * 0.5 },
        });
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
        const centroid = interiorPoint(pick.ring, pick.holes);
        setSceneSelection({
          kind: "building",
          buildingId: pick.id,
          clientX: 640,
          clientY: 420,
          world: { east: centroid[0], north: centroid[1], up: pick.height * 0.5 },
        });
        return pick.id;
      },
      exportPlanSnapshot: () => model,
      pickZoneDefaultPanelQa() {
        const rows = qaDisplayBuildingsRef.current.filter((b) => b.heightFromFallback);
        const pick =
          rows.find((b) => b.zoneDefaultNote?.includes("estimate, no measured height")) ?? rows[0];
        if (!pick) return null;
        const at = interiorPoint(pick.ring, pick.holes);
        setSceneSelection({
          kind: "building",
          buildingId: pick.id,
          clientX: 480,
          clientY: 420,
          world: { east: at[0], north: at[1], up: pick.height * 0.5 },
        });
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
  const walk = useWalkViewshed(model, displayModel);
  const walkAt = useWalkPlayback(walk);

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
      importedMassingUpperLevels: massing.drawingUpperLevels,
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
  }, [displayModel, massing.drawingBuildings, massing.drawingUpperLevels, view3dDisplay]);
  const sunHoursAssessModel = useMemo(
    () => sunHoursModel(tab === "drawing", displayModel, drawingModel, massing.drawingBuildings),
    [tab, displayModel, drawingModel, massing.drawingBuildings],
  );
  const sunHoursGround = useSunHoursGround(
    sunHoursAssessModel,
    solar.year,
    solar.month,
    solar.day,
    Boolean(solar.sunHours),
    renderQuality,
    solar.sunHoursWindow,
  );
  const sunHoursPickedIds = useMemo(() => {
    if (hideSelection.length > 0) return hideSelection;
    const inspected = sceneSelectionBuildingId(sceneSelection);
    return inspected != null ? [inspected] : [];
  }, [hideSelection, sceneSelection]);
  const {
    grid: sunHoursResultGrid,
    overlay: sunHoursResultOverlay,
    scaleMaxHours: sunHoursResultScaleMax,
  } = sunHoursGround;
  const sunHoursPlanPickedOnly = Boolean(solar.sunHoursPickedOnly) && tab === "drawing";
  const sunHoursPlan = useMemo(
    () =>
      sunHoursPlanLayers(
        sunHoursAssessModel,
        { grid: sunHoursResultGrid, overlay: sunHoursResultOverlay, scaleMaxHours: sunHoursResultScaleMax },
        sunHoursPlanPickedOnly,
        sunHoursPickedIds,
      ),
    [
      sunHoursAssessModel,
      sunHoursResultGrid,
      sunHoursResultOverlay,
      sunHoursResultScaleMax,
      sunHoursPlanPickedOnly,
      sunHoursPickedIds,
    ],
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
    sceneSelection?.kind === "building"
      ? (displayModel.buildings.find((building) => building.id === sceneSelection.buildingId) ?? null)
      : null;

  const pickedTree =
    sceneSelection?.kind === "tree"
      ? (displayModel.trees.find((tree) => tree.id === sceneSelection.treeId) ?? null)
      : null;

  const pickedImported = useMemo(() => {
    if (sceneSelection?.kind !== "imported") return null;
    const massingItem = massing.imported.find((item) => item.id === sceneSelection.fileId);
    const building = massingItem?.buildings.find((item) => item.id === sceneSelection.buildingId);
    return massingItem && building ? { massing: massingItem, building } : null;
  }, [massing.imported, sceneSelection]);

  function selectImportedBuilding(fileId: string, buildingId: string, clientX: number, clientY: number) {
    const footprint = massing.drawingBuildings.find(
      (building) =>
        !building.importedMassingShadowCaster &&
        building.importedBuilding?.fileId === fileId &&
        building.importedBuilding.buildingId === buildingId,
    );
    const at = footprint ? interiorPoint(footprint.ring, footprint.holes) : null;
    const top = footprint?.importedTopZ ?? 0;
    setSceneSelection({
      kind: "imported",
      fileId,
      buildingId,
      clientX,
      clientY,
      world: at ? { east: at[0], north: at[1], up: top - (footprint?.height ?? 0) * 0.45 } : { east: 0, north: 0, up: 0 },
    });
    setInspectHudScreen({ clientX, clientY, inView: true });
    setHideSelection([]);
  }

  function clearImportedSelection() {
    if (sceneSelection?.kind !== "imported") return;
    setSceneSelection(null);
    setInspectHudScreen(null);
  }

  const inspectAnchor = useMemo((): SceneInspectWorld | null => {
    if (!sceneSelection) return null;
    if (sceneSelection.kind === "imported") return pickedImported?.building.visible && pickedImported.massing.visible ? sceneSelection.world : null;
    if (sceneSelection.kind === "terrain" || sceneSelection.kind === "tree") return sceneSelection.world;
    return null;
  }, [sceneSelection, pickedImported]);

  const [inspectDockResize, setInspectDockResize] = useState(0);
  useEffect(() => {
    const onResize = () => setInspectDockResize((count) => count + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const buildingCardOpen = sceneSelection?.kind === "building";
  const inspectHudPosition = useMemo(
    () =>
      buildingCardOpen
        ? measureInspectHudDock()
        : inspectHudPlacement(inspectHudScreen, sceneSelection, {
            width: typeof window !== "undefined" ? window.innerWidth : 1440,
            height: typeof window !== "undefined" ? window.innerHeight : 900,
          }),
    [buildingCardOpen, inspectDockResize, inspectHudScreen, sceneSelection],
  );

  function persistHidden(next: HiddenBuildingStore) {
    setHiddenStore(next);
    writeStoredHiddenBuildings(window.localStorage, next);
  }

  function hideSelectedBuildings() {
    const ids = new Set(
      hideSelection.length ? hideSelection : sceneSelectionBuildingId(sceneSelection) != null ? [sceneSelectionBuildingId(sceneSelection)!] : [],
    );
    const picked = overrideResult.buildings.filter((building) => ids.has(building.id));
    if (picked.length === 0) return;
    persistHidden(hideBuildings(hiddenStore, picked, model.center));
    setHideSelection([]);
    setSceneSelection(null);
    setInspectHudScreen(null);
  }

  function selectForHide(buildingId: number, additive?: boolean) {
    setHideSelection((prev) => nextHideSelection(prev, buildingId, Boolean(additive)));
  }

  function persistOverrides(next: HeightOverrideStore) {
    setHeightOverrideStore(next);
    writeStoredHeightOverrides(window.localStorage, next);
  }

  function saveBuildingHeight(buildingId: number, heightM: number) {
    const building = baseBuildings.find((item) => item.id === buildingId);
    if (!building) return;
    persistOverrides(upsertOverrideForBuilding(heightOverrideStore, building, model.center, heightM));
    setSceneSelection(null);
    setInspectHudScreen(null);
  }

  function resetBuildingHeight(buildingId: number) {
    const building = baseBuildings.find((item) => item.id === buildingId);
    if (!building) return;
    persistOverrides(removeOverrideForBuilding(heightOverrideStore, building, model.center));
    setSceneSelection(null);
    setInspectHudScreen(null);
  }

  function resetAllHeights() {
    if (!window.confirm("Reset every manual building height in storage?")) return;
    persistOverrides(clearAllHeightOverrides());
    setSceneSelection(null);
    setInspectHudScreen(null);
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
  const viewAnalysisOpen = analyses.view;
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
    () => (siteWind ? analyzeSiteWind(siteWind, windSettings.period, windSettings.daypart) : null),
    [siteWind, windSettings.period, windSettings.daypart],
  );
  const windModel = useMemo(
    () => windObstacleModel(displayModel, massing.drawingBuildings),
    [displayModel, massing.drawingBuildings],
  );
  const windPlanOutlineModel = useMemo(
    () => withImportedOutlines(displayModel, massing.drawingBuildings),
    [displayModel, massing.drawingBuildings],
  );
  const designWinds = useMemo(() => (siteWind ? designWindsFor(siteWind) : []), [siteWind]);
  const designWind = findDesignWind(designWinds, windSettings.designWind);
  const windStreams = useMemo(() => prevailingStreams(consoleWindStats, designWind), [consoleWindStats, designWind]);
  const analysisCards = analysisCardsOn(tab, analyses);
  const analysisCardOn = anyAnalysisCardOn(tab, analyses);
  const [analysisCardFocus, setAnalysisCardFocus] = useState(() => initialAnalysisCardFocus(analyses));
  if (analysisCardFocus.seen !== analyses) setAnalysisCardFocus(nextAnalysisCardFocus(analysisCardFocus, analyses));
  const toggleAnalysisCard = (kind: SiteAnalysisKind) => setAnalysisCardFocus((focus) => focusAnalysisCard(focus, kind));
  const [siteIntelFolded, setSiteIntelFolded] = useState(() => siteIntelAutoFolded(analysisCardOn));
  useEffect(() => setSiteIntelFolded(siteIntelAutoFolded(analysisCardOn)), [analysisCardOn]);
  const [sunDomeSizeM, setSunDomeSizeM] = useState<number | null>(null);
  const sunDome = useMemo(() => {
    const range = sunDomeRange(model);
    return { range, chosenM: sunDomeSizeM, radiusM: resolveSunDomeRadiusM(range, sunDomeSizeM) };
  }, [model, sunDomeSizeM]);
  const windSpreadRadiusM = solarSettingsForActiveAnalysis(solar, analyses).showPath ? sunDome.radiusM : null;
  const windPlan = useWindPlan({
    model: windModel,
    siteWind,
    period: windSettings.period,
    daypart: windSettings.daypart,
    designWind,
    designWinds,
    clearDesignWind: () => commitWind({ ...windSettings, designWind: null }),
    active: tab === "3d" && view.projection === "plan" && analyses.wind && siteWind != null,
    scaleWanted: tab === "3d" && windSettings.enabled && analyses.wind,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector(".model");
    if (!root) return;
    if (siteWind && consoleWindStats) {
      root.setAttribute("data-wind-station", siteWind.station.name);
      root.setAttribute("data-wind-distance-km", String(siteWind.station.distanceKm ?? ""));
      root.setAttribute("data-wind-period", `${siteWind.station.periodStart}–${siteWind.station.periodEnd}`);
      root.setAttribute("data-wind-years", String(siteWind.station.years ?? ""));
      root.setAttribute("data-wind-reason", siteWind.station.reason);
      const record = seasonRecord(siteWind, windSettings.period, windSettings.daypart);
      root.setAttribute(
        "data-ground-wind-deg",
        String(
          designWind?.headingDeg ??
            (windPlan.sector != null && record && windPlan.sector !== sectorIndex(record.prevailingDirDeg)
              ? sectorCenterDeg(windPlan.sector)
              : (record?.prevailingDirDeg ?? sectorCenterDeg(consoleWindStats.prevailingSector))),
        ),
      );
      root.setAttribute("data-ground-wind-season", designWind?.id ?? windSettings.period);
      root.setAttribute("data-wind-daypart", windSettings.daypart);
    } else {
      root.removeAttribute("data-wind-station");
      root.removeAttribute("data-wind-distance-km");
      root.removeAttribute("data-wind-period");
      root.removeAttribute("data-wind-years");
      root.removeAttribute("data-wind-reason");
      root.removeAttribute("data-ground-wind-deg");
      root.removeAttribute("data-ground-wind-season");
      root.removeAttribute("data-wind-daypart");
    }
  }, [siteWind, consoleWindStats, windSettings.period, windSettings.daypart, designWind, windPlan.sector]);

  useEffect(() => {
    if (!consolePlaying) return;
    let raf = 0;
    let last = performance.now();
    let minutesFloat = clampSolarSliderMinutes(solar.hour * 60 + solar.minute);
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      minutesFloat += dt * 72;
      if (minutesFloat > SOLAR_SLIDER_END_MIN) minutesFloat = SOLAR_SLIDER_START_MIN;
      const rounded = Math.round(minutesFloat);
      const hour = Math.floor(rounded / 60);
      const minute = rounded % 60;
      setSolar((prev) => ({ ...prev, hour, minute, castShadows: true }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [consolePlaying]);

  function selectSection(id: string) {
    if (id === "solar" || id === "wind" || id === "view") setAnalyses((current) => withAnalysisOn(current, id));
    if (id === "wind") setWindStreaksOn(true);
    const resolved = isRightSidebarSection(id)
      ? resolveRightSidebarSection(id, sectionIds)
      : resolveSidebarSection(id, sectionIds);
    dispatchSidebar({ type: "select", id: resolved });
    if (!isRightSidebarSection(resolved)) {
      setSidebarCollapsed(false);
    }
  }

  const applyShortcut = useCallback(
    (action: ModelShortcutAction) => {
      if (action.section === "analysis") {
        if (isSiteAnalysisKind(action.analysisKind)) {
          const kind = action.analysisKind;
          setAnalyses((current) => withAnalysisOn(current, kind));
          if (kind === "wind") setWindStreaksOn(true);
        }
        return;
      }
      selectSection(action.section);
    },
    [sectionIds, setSidebarCollapsed],
  );

  useEffect(() => {
    if (viewportIsNarrow()) return;
    registerModelKeyboardBridge({ applyShortcut });
    return () => registerModelKeyboardBridge(null);
  }, [applyShortcut]);

  useEffect(() => {
    if (viewportIsNarrow()) return;
    function onKeyDown(event: KeyboardEvent) {
      const result = handleModelKeyDown({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        target: event.target,
        commandBarOpen,
        cheatsheetOpen: shortcutCheatsheetOpen,
      });
      if (result.type === "none") return;
      event.preventDefault();
      if (result.type === "open-cheatsheet") setShortcutCheatsheetOpen(true);
      else if (result.type === "close-cheatsheet") setShortcutCheatsheetOpen(false);
      else if (result.type === "shortcut") applyShortcut(result.action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyShortcut, commandBarOpen, shortcutCheatsheetOpen]);

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
      setShowSource(false);
      setColourByUse(true);
    }
    if (view3dDisplay.primaryView || !isLayer3dVisible(view3dDisplay, "buildings")) {
      commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, primaryView: false }, "buildings", true));
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
        uniformBuildings: !colourByUse && !showSource,
        colourBySource: showSource,
        wind:
          windSettings.enabled && siteWind
            ? { selection: siteWind, period: windSettings.period }
            : null,
        windStreaks: windDiagramActive(windStreaksOn, analyses) ? windStreams : null,
        windStreaksSpreadRadiusM: windSpreadRadiusM,
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

  async function sunStudyExportLayers(): Promise<SitePlanExportOptions["sunStudy"]> {
    if (!sunStudyDate) return null;
    const casters = sunStudyCasterModel(drawingModel, effectiveSunStudyCasters, sunStudySelected);
    return { layers: await sunStudyLayersFor(casters, sunStudyDate) };
  }

  const qaPlanBridgeRef = useRef<{
    upperLevelGroupCount: () => number;
    exportFrameSvg: () => Promise<string>;
    zoomToImportedMassing: () => boolean;
    zoom3dToImportedMassing: () => boolean;
    setPlanSunMode: (hour: number, castShadows: boolean, sunStudy: boolean) => boolean;
    selectSunStudyBuilding: (id: number) => boolean;
    clearSunStudySelection: () => boolean;
    sunStudyPickBuildingId: () => number | null;
    firstImportedDisplayBuildingId: () => number | null;
    sunStudyCasterStats: () => { total: number; podiumLevel: number; shadowPathChars: number };
  }>({
    upperLevelGroupCount: () => 0,
    exportFrameSvg: async () => "",
    zoomToImportedMassing: () => false,
    zoom3dToImportedMassing: () => false,
    selectSunStudyBuilding: () => false,
    clearSunStudySelection: () => false,
    sunStudyPickBuildingId: () => null,
    firstImportedDisplayBuildingId: () => null,
    sunStudyCasterStats: () => ({ total: 0, podiumLevel: 0, shadowPathChars: 0 }),
    setPlanSunMode: () => false,
  });
  qaPlanBridgeRef.current = {
    upperLevelGroupCount: () => document.querySelectorAll("svg.plan [data-upper-z]").length,
    exportFrameSvg: async () => {
      const { sitePlanFrameSvg } = await import("../../lib/aiPlan");
      return sitePlanFrameSvg(drawingModel, figureScale, lineStyles, {
        ...sitePlanExportOptions(),
        sunStudy: await sunStudyExportLayers(),
      });
    },
    zoomToImportedMassing: () => {
      const points: [number, number][] = [];
      for (const building of drawingModel.buildings) {
        if (!building.importedMassing || building.importedMassingShadowCaster) continue;
        for (const [e, n] of building.ring) points.push([e, n]);
      }
      for (const level of drawingModel.importedMassingUpperLevels ?? []) {
        for (const line of level.lines) for (const [e, n] of line) points.push([e, n]);
      }
      if (points.length === 0) return false;
      let minE = Infinity;
      let maxE = -Infinity;
      let minN = Infinity;
      let maxN = -Infinity;
      for (const [e, n] of points) {
        minE = Math.min(minE, e);
        maxE = Math.max(maxE, e);
        minN = Math.min(minN, n);
        maxN = Math.max(maxN, n);
      }
      setPlanViewport(planViewportForBounds(minE, minN, maxE, maxN));
      return true;
    },
    zoom3dToImportedMassing: () => {
      const group = massing.group;
      if (!group || typeof window === "undefined" || !window.__citycutQa?.setCamera) return false;
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) return false;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.z, 80);
      const eyeY = center.y + Math.max(size.y * 0.55, 45);
      window.__citycutQa.setCamera({
        eye: { x: center.x - span * 0.85, y: eyeY + span * 0.65, z: center.z + span * 1.05 },
        target: { x: center.x, y: center.y + size.y * 0.2, z: center.z },
      });
      return true;
    },
    setPlanSunMode: (hour, castShadows, sunStudy) => {
      commitSolar({
        ...solar,
        hour,
        minute: 0,
        castShadows,
        sunStudy,
        sunStudyCasters: sunStudySelected.length > 0 ? "selected" : "all",
      });
      return true;
    },
    selectSunStudyBuilding: (id) => {
      setSunStudySelected([id]);
      commitSolar({ ...solar, sunStudyCasters: "selected" });
      return true;
    },
    clearSunStudySelection: () => {
      setSunStudySelected([]);
      commitSolar({ ...solar, sunStudyCasters: "all" });
      return true;
    },
    sunStudyPickBuildingId: () => {
      const pick = drawingModel.buildings.find(
        (building) => !building.importedMassingShadowCaster && building.height >= 4,
      );
      return pick?.id ?? drawingModel.buildings[0]?.id ?? null;
    },
    firstImportedDisplayBuildingId: () =>
      drawingModel.buildings.find((building) => building.importedMassingSkipShadow)?.id ?? null,
    sunStudyCasterStats: () => {
      const casters = sunStudyShadowCasters(
        drawingModel.buildings,
        effectiveSunStudyCasters,
        sunStudySelected,
      ).filter((building) => building.importedMassingShadowCaster || !building.importedMassing);
      const podiumLevel = casters.filter((building) => (building.importedTopZ ?? 0) <= 30).length;
      const shadowPathChars = [...document.querySelectorAll("svg.plan [data-shadow-hour] path")].reduce(
        (sum, path) => sum + (path.getAttribute("d")?.length ?? 0),
        0,
      );
      return { total: casters.length, podiumLevel, shadowPathChars };
    },
  };

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    window.__citycutQaPlan = {
      upperLevelGroupCount: () => qaPlanBridgeRef.current.upperLevelGroupCount(),
      exportSitePlanFrameSvg: () => qaPlanBridgeRef.current.exportFrameSvg(),
      zoomPlanToImportedMassing: () => qaPlanBridgeRef.current.zoomToImportedMassing(),
      zoom3dToImportedMassing: () => qaPlanBridgeRef.current.zoom3dToImportedMassing(),
      setPlanSunMode: (hour, castShadows, sunStudy) =>
        qaPlanBridgeRef.current.setPlanSunMode(hour, castShadows, sunStudy),
      selectSunStudyBuilding: (id) => qaPlanBridgeRef.current.selectSunStudyBuilding(id),
      clearSunStudySelection: () => qaPlanBridgeRef.current.clearSunStudySelection(),
      sunStudyPickBuildingId: () => qaPlanBridgeRef.current.sunStudyPickBuildingId(),
      firstImportedDisplayBuildingId: () => qaPlanBridgeRef.current.firstImportedDisplayBuildingId(),
      sunStudyCasterStats: () => qaPlanBridgeRef.current.sunStudyCasterStats(),
    };
    return () => {
      delete window.__citycutQaPlan;
    };
  }, []);

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
      await downloadFigureSvg(drawingModel, figureScale, lineStyles, heliodonDiagramExport(), drawingLandmarkSources);
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

  async function saveSite3dm() {
    setExportError(null);
    setBusy("3dm-site");
    try {
      await downloadSite3dm(drawingModel, figureScale, lineStyles, {
        ...sitePlanExportOptions(),
        sunStudy: await sunStudyExportLayers(),
      });
    } catch {
      setExportError("The site plan .3dm could not be written.");
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

  const figureFit = sheetFitMessageForModel(model, figureScale);
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
  const wikidata = useWikidataLandmarks(model);
  const [landmarkLabelsOn, setLandmarkLabelsOn] = useState(LANDMARK_LABELS_DEFAULT_ON);
  const [landmarkScreens, setLandmarkScreens] = useState<LandmarkScreenState | null>(null);
  const landmarkByBuilding = useMemo(
    (): ReadonlyMap<number, WikidataLandmark> =>
      wikidata.status === "ok" ? landmarksByBuilding(wikidata.matches, model.buildings) : new Map(),
    [wikidata, model.buildings],
  );
  const landmarkSources = useMemo(
    () => landmarkLabelSources(landmarkByBuilding, displayModel.buildings),
    [landmarkByBuilding, displayModel.buildings],
  );
  const drawingLandmarkSources = useMemo(
    () => (landmarkLabelsOn ? landmarkLabelSources(landmarkByBuilding, drawingModel.buildings) : []),
    [landmarkLabelsOn, landmarkByBuilding, drawingModel.buildings],
  );
  const dataSources = buildDataSources({
    model,
    wikidata,
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
          if (view3dDisplay.primaryView || !isLayer3dVisible(view3dDisplay, "trees")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, primaryView: false }, "trees", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "roads" as const,
        label: "Roads",
        meta: `${formatLengthKm(model.roadKm)} km`,
        color: viewStyleRoadChipColor(view3dDisplay.primaryView, colourByUse, showSource),
        available: model.layers.roads && model.roads.some((r) => r.kind === "road" && r.grade !== "path"),
        onPick: (value: string) => {
          commitColour("--road-local", value);
          commitColour("--road-arterial", value);
          commitColour("--road-fill", value);
          if (view3dDisplay.primaryView || !isLayer3dVisible(view3dDisplay, "roads")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, primaryView: false }, "roads", true));
          }
          setLineStyles(readDrawingStyle());
        },
      },
      {
        id: "footpaths" as const,
        label: "Footpaths",
        meta: model.roads.filter((r) => r.kind === "road" && r.grade === "path").length.toLocaleString(),
        color: viewStyleFootpathChipColor(view3dDisplay.primaryView, colourByUse, showSource),
        available: model.layers.roads && model.roads.some((r) => r.kind === "road" && r.grade === "path"),
        onPick: (value: string) => {
          commitColour("--road-path", value);
          commitColour("--path-fill", value);
          if (view3dDisplay.primaryView || !isLayer3dVisible(view3dDisplay, "footpaths")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, primaryView: false }, "footpaths", true));
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
          if (view3dDisplay.primaryView || !isLayer3dVisible(view3dDisplay, "landscape")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, primaryView: false }, "landscape", true));
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
          if (view3dDisplay.primaryView || !isLayer3dVisible(view3dDisplay, "water")) {
            commitView3dDisplay(setLayer3dVisible({ ...view3dDisplay, primaryView: false }, "water", true));
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

  useEffect(() => {
    const root = modelRootRef.current;
    if (!root) return;
    const barGap = 16;
    const measure = () => {
      const left = root.querySelector(".top-bar-left");
      const center = root.querySelector(".top-bar-center");
      const right = root.querySelector(".top-bar-right");
      if (!(left instanceof HTMLElement) || !(center instanceof HTMLElement) || !(right instanceof HTMLElement)) {
        return;
      }
      const inner = window.innerWidth - 28;
      const compass = center.querySelector(".studio-compass");
      const compassSpan = compass instanceof HTMLElement ? compass.offsetWidth + 8 : 0;
      const bundle = center.offsetWidth + 2 * (Math.max(left.offsetWidth, right.offsetWidth) + compassSpan) + barGap * 2;
      setTopbarLayout(bundle <= inner + 0.5 ? "centered" : "flow");
    };
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tab, drawing, view.projection, view.freeRotate, cutDimLabel, topbarExportOpen, busy, sourcesLoaded.loaded]);

  return {
    drawingLandmarkSources,
    landmarkByBuilding,
    landmarkLabelsOn,
    landmarkScreens,
    landmarkSources,
    setLandmarkLabelsOn,
    setLandmarkScreens,
    wikidataStatus: wikidata.status,
    analyses,
    annotatedAppliedBuildings,
    applyShortcut,
    axoSettings,
    baseBuildings,
    buildingsAsMesh,
    busy,
    cameraMemory,
    introPlayed,
    colourByUse,
    comFetchBounds,
    comFootprintFetchError,
    comFootprintLoading,
    comFootprintRetryToken,
    comFootprints,
    comHeightBuildings,
    comHeightsApplyFailed,
    comHeightsMeasuredOn,
    comHeightsStatus,
    comHeightsStatusNote,
    comMeasuredHeightCount,
    commandBarOpen,
    commitRenderQuality,
    commitSolar,
    commitView,
    commitView3dDisplay,
    commitWind,
    compassHeadingDeg,
    consoleDaylight,
    consolePlaying,
    consoleSun,
    consoleWindStats,
    crs,
    cutDimLabel,
    dataSources,
    dispatchSidebar,
    defaultExplodedAxoGapM,
    defaultExplodedAxoSettings,
    displayModel,
    windModel,
    windPlanOutlineModel,
    dragReorderAxoLayer,
    draggedAxoLayer,
    drawing,
    drawingModel,
    drawingViewportsInitializedRef,
    effectiveSunStudyCasters,
    explodedAxoBounds,
    explodedAxoViewportExtent,
    explodedViewport,
    exportError,
    exportHeightEdits,
    exportRef,
    fallbackBuildings,
    figureFit,
    figureScale,
    fitCounter,
    heightBar,
    heightBarParts,
    heightOverrideStore,
    heightPerfRef,
    heightTierCounts,
    heightTierLegend,
    heliodonDiagramExport,
    heliodonPlanDiagramBase,
    heliodonRhinoExport,
    hiddenBuildingUses,
    hiddenMatch,
    hiddenStore,
    hideSelectedBuildings,
    hideSelection,
    importHeightEdits,
    inComCity,
    inspectAnchor,
    inspectHudPosition,
    inspectHudScreen,
    introHoldReleasedRef,
    introWebglReadyRef,
    isoDrawingViewport,
    isometricDrawingBounds,
    AXO_LAYER_LABELS,
    items,
    layerBits,
    leftOpen,
    leftSectionIds,
    lidarTierNote,
    lineStyles,
    massing,
    model,
    modelRootRef,
    onExportReady,
    onHome,
    onNewCut,
    onScale,
    overrideResult,
    persistHidden,
    persistOverrides,
    pickBuildingUseColour,
    planHeliodonForSiteExport,
    planScaleOptions,
    planShadowInput,
    planViewport,
    pickedBuilding,
    pickedTree,
    pickedImported,
    selectImportedBuilding,
    clearImportedSelection,
    planWidth,
    presentBuildingUses,
    qaDisplayBuildingsRef,
    qaPlanBridgeRef,
    qaSummaryRef,
    renderQuality,
    resetAllHeights,
    resetBuildingHeight,
    referenceExplodedAxoSettings,
    resetSceneLayerColours,
    retryComHeights,
    rightItems,
    rightOpen,
    rightSectionIds,
    save3dm,
    saveBuildingHeight,
    saveExplodedAxoAi,
    saveFigureAi,
    saveFigureSvg,
    saveIsometricAi,
    saveIsometricSvg,
    savePng,
    saveSite3dm,
    saveSiteAi,
    saveSiteSvg,
    saveSunStudyAi,
    sceneLayerRows,
    sceneSelection,
    sectionIds,
    selectForHide,
    selectSection,
    setAnalyses,
    setWindStreaksOn,
    setAxoLayerLift,
    setAxoSettings,
    setBuildingsAsMesh,
    setBusy,
    setColourByUse,
    setComFootprintFetchError,
    setComFootprintLoading,
    setComFootprintRetryToken,
    setComFootprints,
    setComHeightBuildings,
    setComHeightsApplyFailed,
    setCompassHeadingDeg,
    setConsolePlaying,
    setDrawing,
    setExplodedViewport,
    setExportError,
    setFigureScale,
    setFitCounter,
    setHeightOverrideStore,
    setHiddenBuildingUses,
    setHiddenStore,
    setHideSelection,
    setInspectHudScreen,
    setIsoDrawingViewport,
    setLineStyles,
    setPlanViewport,
    setPlanWidth,
    setRenderQuality,
    setSceneSelection,
    setShortcutCheatsheetOpen,
    setShowManualEdits,
    setShowSource,
    setSidebarCollapsed,
    setSnapId,
    setSolar,
    setSunStudyProgress,
    setSunStudySelected,
    setTab,
    setTopbarExportOpen,
    setUnmatchedEdits,
    setView,
    setView3dDisplay,
    setWindNote,
    setWindSettings,
    shortcutCheatsheetOpen,
    showAllInCut,
    showBuildings,
    showHiddenEntry,
    showManualEdits,
    showSource,
    showTrees,
    sidebar,
    sidebarCollapsed,
    siteIntelOpen,
    setSiteIntelOpen,
    siteIntelFolded,
    analysisCards,
    analysisCardOn,
    analysisCardOpen: analysisCardFocus.open,
    toggleAnalysisCard,
    sunDome,
    setSunDomeSizeM,
    windSpreadRadiusM,
    setSiteIntelFolded,
    sidebarModelRef,
    sitePlanExportOptions,
    snapId,
    solar,
    sourceCounts,
    sourcesLoaded,
    sunHoursGround,
    sunHoursPickedIds,
    sunHoursPlan,
    sunStudyDate,
    sunStudyExportLayers,
    sunStudyProgress,
    sunStudySelected,
    tab,
    tierCounts,
    topbarExportOpen,
    topbarExportRef,
    topbarExportTriggerRef,
    topbarLayout,
    uniform,
    unmatchedEdits,
    useCounts,
    view,
    view3dDisplay,
    viewAnalysisOpen,
    viewportModelKeyRef,
    visibleBuildings,
    walk,
    walkAt,
    walkDrawing,
    wantWindTable,
    windMotion,
    windStreams,
    windStreaksOn,
    windNote,
    windSettings,
    windPlan,
    designWinds,
    designWind,
    siteWind,
    writeStoredShowManualHeights,
  };
}

export type ModelPageViewModel = ReturnType<typeof useModelPage>;
