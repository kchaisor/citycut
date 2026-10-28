import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MapStage, type FlyRequest } from "./components/MapStage";
import { SelectChrome } from "./components/SelectChrome";
import { useSidebarCollapsed } from "./lib/sidebarCollapse";
import { viewportIsNarrow } from "./lib/panelCollapse";
import {
  DEFAULT_LAYERS,
  DEFAULT_SIDE_KM,
  DEFAULT_ZOOM,
  MAX_AREA_M2,
  MELBOURNE,
} from "./content/constants";
import { comRecordsToTrees, fetchComTreesDetailed, type ComTree } from "./lib/comTrees";
import {
  isoDay,
  loadPrebakedTrees,
  OSM_TREES_ODBL_CREDIT,
  prebakeBackupNote,
  prebakeSourceNote,
  type PrebakeResult,
} from "./lib/treesPrebake";
import type { VicmapPoint } from "./lib/vicmapTrees";
import { fetchTerrainForCut } from "./lib/fetchTerrain";
import {
  explicitLabel,
  frameFromSearch,
  siteAnchorFromSearch,
  writeFrameSearch,
  writeSiteAnchorSearch,
  type FrameQuery,
} from "./lib/frameQuery";
import { resolveSiteFrame, shouldResolveSite, siteAttributionNote } from "./lib/site";
import { squareBBox } from "./lib/geo";
import { siteFrameAreaM2, type SiteFrameShape } from "./lib/siteFrame";
import { localityCacheKey, reverseLocality } from "./lib/nominatim";
import { FLAT_GROUND_NOTE } from "./lib/parseOsm";
import { fetchOvertureBaseForCut, overtureTreesFromPoints } from "./lib/overtureBase";
import { overtureThemeCredit } from "./lib/overtureAttribution";
import { fetchTramLinesForCut } from "./lib/explodedAxoPt";
import { fetchOvertureTransportationForCut } from "./lib/overtureTransportation";
import { withRoundaboutIslands } from "./lib/roundabouts";
import {
  REVERSE_DEBOUNCE_MS,
  addressStillApplies,
  coordinateLabel,
  cutSizeLabel,
  resolveSearchedCut,
} from "./lib/placeLabel";
import { TERRAIN_UNAVAILABLE, terrainNote } from "./lib/terrain";
import { MAX_TREE_INSTANCES, assembleTreeTiers } from "./lib/treeTiers";
import { replaceTreeNote, treeSourceLoadNotes, treeTierCounts } from "./lib/trees";
import { fetchVicmapTreesDetailed, vicmapPointsToTrees, VICMAP_ATTRIBUTION } from "./lib/vicmapTrees";
import { COM_TREES_CREDIT } from "./lib/comTreesCredit";
import { loadContoursForCut } from "./lib/vicmapContours";
import { contourGroundSourceName, contourTerrain, contourTerrainNotice } from "./lib/contourTerrain";
import { detectRegion } from "./lib/region";
import { fetchNswLayers, type NswLayers } from "./lib/nswLayers";
import { loadNswContoursForCut } from "./lib/nswContours";
import { nswApplyBuildingUse, nswLightRailLines, nswSourceNote, nswWaterAreas } from "./lib/nswModel";
import { groundRoadPartition } from "./lib/groundRoads";
import { NSW_BUILDING_ESTIMATE_NOTE } from "./lib/sources/registry";
import { fetchOvertureBuildingsForCut } from "./lib/overtureBuildings";
import { qaForcedCrashFromSearch, qaModeFromSearch } from "./lib/qaCameraBridge";
import { siteBuildingOverlaps } from "./lib/siteBuildings";
import {
  applyLidarHeightsFromEnrichment,
  mergeBuildingEnrichment,
} from "./lib/buildingEnrichmentMerge";
import { fetchBuildingEnrichmentForCut, fetchEnrichmentManifest } from "./lib/buildingEnrichmentTiles";
import { cutCenterOutsideBuiltBbox, enrichmentCoverageMessage } from "./lib/enrichmentCoverage";
import { lidarLegendLine, logLidarEnrichmentStatus } from "./lib/lidarTierStatus";
import { computeCityBlocks } from "./lib/cityBlocks";
import { assignExternalUses, loadUseTiers } from "./lib/useCascade";
import {
  fetchComBuildingFootprintsWithStats,
  intersectsComCity,
  paddedComFetchBounds,
} from "./lib/comBuildingHeights";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "./lib/comDevelopmentFloors";
import { resolveBuildingHeightsAfterCom } from "./lib/buildingHeightPipeline";
import { runComBuildingHeightsInWorker } from "./lib/comBuildingHeightsWorkerClient";
import { buildHeightSourceLoadWarnings } from "./lib/buildHeightSourceLoadWarnings";
import { buildEnrichmentUseTierFailures } from "./lib/enrichmentUseTierFailures";
import type { Basemap, CityModel, LonLat, PlaceHit, UiLayers, UseTierFailure, ViewState } from "./types";

function frameFromQuery(): FrameQuery | null {
  if (typeof window === "undefined") return null;
  return frameFromSearch(window.location.search);
}

let modelPagePromise: Promise<{ default: typeof import("./components/ModelPage").ModelPage }> | null = null;
function yieldToBrowserFrame(skip: boolean): Promise<void> {
  if (skip || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function preloadModelPage() {
  if (!modelPagePromise) {
    modelPagePromise = import("./components/ModelPage")
      .then((mod) => ({ default: mod.ModelPage }))
      .catch((err) => {
        console.error("[PRELOAD_MODELPAGE_ERR]", err);
        modelPagePromise = null;
        throw err;
      });
  }
  return modelPagePromise;
}
const ModelPage = lazy(preloadModelPage);

type PlaceAnchor = LonLat & { label: string };

function QaCrashThrower(): null {
  throw new Error("QA forced fatal error");
}

export default function App() {
  if (typeof window !== "undefined" && qaForcedCrashFromSearch(window.location.search)) {
    return <QaCrashThrower />;
  }
  const queried = frameFromQuery();
  const initialView: ViewState = queried?.view ?? { ...MELBOURNE, zoom: DEFAULT_ZOOM };
  const sharedLabel = typeof window === "undefined" ? null : explicitLabel(window.location.search);
  const urlSiteAnchor =
    typeof window === "undefined" ? null : siteAnchorFromSearch(window.location.search);
  const viewRef = useRef<ViewState>(initialView);
  // Read once at load: on a phone each new landing map zooms out to fit the frame.
  const [fitFrameOnLoad] = useState(viewportIsNarrow);
  const [cutCenter, setCutCenter] = useState({ lat: initialView.lat, lon: initialView.lon });
  const anchorRef = useRef<PlaceAnchor | null>(
    sharedLabel
      ? {
          lon: urlSiteAnchor?.lon ?? initialView.lon,
          lat: urlSiteAnchor?.lat ?? initialView.lat,
          label: sharedLabel,
        }
      : null,
  );
  const placeLabelRef = useRef(sharedLabel ?? coordinateLabel(initialView.lat, initialView.lon));
  const sideRef = useRef(queried?.sideKm ?? DEFAULT_SIDE_KM);
  const phaseRef = useRef<"select" | "model">("select");
  const settleTimer = useRef<number | null>(null);
  const lookupGen = useRef(0);
  /** False while a search fly is still travelling from the previous centre. */
  const flyLandedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const [sideKm, setSideKm] = useState(queried?.sideKm ?? DEFAULT_SIDE_KM);
  const [frameShape, setFrameShape] = useState<SiteFrameShape>(queried?.frameShape ?? "square");
  const frameShapeRef = useRef(frameShape);
  frameShapeRef.current = frameShape;
  const [layers, setLayers] = useState<UiLayers>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("map");
  const [placeLabel, setPlaceLabel] = useState(placeLabelRef.current);
  const [fly, setFly] = useState<FlyRequest | null>(null);
  const [phase, setPhase] = useState<"select" | "model">("select");
  const [handoffUnderlay, setHandoffUnderlay] = useState<"none" | "holding" | "fading">("none");
  const selectRootRef = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<CityModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapSiteSearch, setMapSiteSearch] = useState<{ lon: number; lat: number; label: string } | null>(() => {
    const anchor = anchorRef.current;
    const urlSite = urlSiteAnchor;
    if (anchor && shouldResolveSite(anchor, urlSite)) return { lon: anchor.lon, lat: anchor.lat, label: anchor.label };
    if (urlSite && sharedLabel) return { lon: urlSite.lon, lat: urlSite.lat, label: sharedLabel };
    return null;
  });
  sideRef.current = sideKm;
  phaseRef.current = phase;
  placeLabelRef.current = placeLabel;

  function writeUrl(siteAnchor: LonLat | null = null) {
    const view = viewRef.current;
    let search = writeFrameSearch(window.location.search, {
      lat: view.lat,
      lon: view.lon,
      sideKm: sideRef.current,
      label: placeLabelRef.current,
      frameShape: frameShapeRef.current,
    });
    if (siteAnchor !== null) search = writeSiteAnchorSearch(search, siteAnchor);
    const nextUrl = `${window.location.pathname}${search}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== current) window.history.replaceState(window.history.state, "", nextUrl);
  }

  function publishLabel(label: string) {
    placeLabelRef.current = label;
    setPlaceLabel(label);
    writeUrl();
  }

  function invalidateLookup() {
    lookupGen.current += 1;
  }

  async function localityOrCoordinates(lat: number, lon: number): Promise<string> {
    try {
      return await reverseLocality(lat, lon);
    } catch {
      return coordinateLabel(lat, lon);
    }
  }

  async function applyLocality(view: ViewState) {
    if (phaseRef.current !== "select") return;
    const anchor = anchorRef.current;
    if (anchor && addressStillApplies(anchor, view, sideRef.current * 1000)) {
      if (placeLabelRef.current !== anchor.label) publishLabel(anchor.label);
      else writeUrl();
      return;
    }
    const gen = ++lookupGen.current;
    let label: string;
    try {
      label = await reverseLocality(view.lat, view.lon);
    } catch {
      label = coordinateLabel(view.lat, view.lon);
    }
    if (gen !== lookupGen.current || phaseRef.current !== "select") return;
    const current = viewRef.current;
    if (localityCacheKey(view.lat, view.lon) !== localityCacheKey(current.lat, current.lon)) return;
    const still = anchorRef.current;
    if (still && addressStillApplies(still, current, sideRef.current * 1000)) {
      publishLabel(still.label);
      return;
    }
    publishLabel(label);
  }

  function scheduleSettle() {
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setCutCenter({ lat: viewRef.current.lat, lon: viewRef.current.lon });
      void applyLocality(viewRef.current);
    }, REVERSE_DEBOUNCE_MS);
  }

  function onView(view: ViewState) {
    viewRef.current = view;
    if (phaseRef.current !== "select") return;
    // Positions along the search fly are not the cut. A reverse lookup of one of
    // them would replace the address with whatever suburb the camera is passing.
    if (anchorRef.current && !flyLandedRef.current) return;
    scheduleSettle();
  }

  function onFlyLanded() {
    flyLandedRef.current = true;
    if (phaseRef.current === "select") scheduleSettle();
  }

  useEffect(() => {
    writeUrl();
  }, [placeLabel, sideKm]);

  useEffect(() => {
    return () => {
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
      lookupGen.current += 1;
    };
  }, []);

  function onLayer(key: keyof UiLayers, on: boolean) {
    setLayers((current) => ({ ...current, [key]: on }));
    if (key === "satellite") setBasemap(on ? "satellite" : "map");
    setError(null);
  }

  function onBasemap(next: Basemap) {
    setBasemap(next);
    setLayers((current) => ({ ...current, satellite: next === "satellite" }));
  }

  function onPlace(place: PlaceHit) {
    anchorRef.current = { lon: place.lon, lat: place.lat, label: place.label };
    setMapSiteSearch({ lon: place.lon, lat: place.lat, label: place.label });
    flyLandedRef.current = false;
    if (settleTimer.current != null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    invalidateLookup();
    publishLabel(place.label);
    setFly({
      token: Date.now(),
      lon: place.lon,
      lat: place.lat,
      bounds: place.bounds,
    });
  }

  function focusMelbourne() {
    anchorRef.current = null;
    setMapSiteSearch(null);
    invalidateLookup();
    publishLabel(coordinateLabel(MELBOURNE.lat, MELBOURNE.lon));
    setFly({
      token: Date.now(),
      lon: MELBOURNE.lon,
      lat: MELBOURNE.lat,
      zoom: DEFAULT_ZOOM,
      bounds: null,
    });
  }

  function onHome() {
    if (phase === "model") {
      setPhase("select");
      return;
    }
    focusMelbourne();
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  async function createModel() {
    const view = viewRef.current;
    const sideM = sideKm * 1000;
    const modelLayers = {
      buildings: layers.buildings,
      roads: layers.roads,
      waterGreen: layers.waterGreen,
      trees: layers.trees,
    };
    const wantsOverture =
      modelLayers.buildings || modelLayers.roads || modelLayers.waterGreen || modelLayers.trees;
    if (!wantsOverture && !layers.terrain && !layers.contours) {
      setError("Turn on Buildings, Roads and rail, Water and green, Trees, Terrain, or Contours.");
      return;
    }
    if (siteFrameAreaM2(sideM, frameShapeRef.current) > MAX_AREA_M2 + 1) {
      setError("That frame is over the 4 km² limit for this version.");
      return;
    }
    if (settleTimer.current != null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const createClickMs = typeof performance !== "undefined" ? performance.now() : 0;
    const isDomTestStart =
      typeof navigator !== "undefined" && /jsdom|HappyDOM/i.test(navigator.userAgent ?? "");
    const prefersReducedStart =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isQaStart = typeof window !== "undefined" && qaModeFromSearch(window.location.search);
    if (!isDomTestStart && !prefersReducedStart && !isQaStart && typeof window !== "undefined") {
      window.__citycutAwaitIntroStart = true;
      window.__citycutIntroStarted = false;
      window.__citycutIntroReadyToFire = false;
      window.__citycutWebglPrewarmReady = false;
      window.__citycutModelPrewarmMounted = false;
      window.__citycutIntroStartMs = undefined;
      window.__citycutFirstTiltFrameMs = undefined;
      window.__citycutLoadProgress = 0;
      window.__citycutProgressSamples = [];
    }
    void preloadModelPage();
    setLoading(true);
    setError(null);
    try {
      const decided = resolveSearchedCut(view, anchorRef.current, sideM, flyLandedRef.current);
      view.lat = decided.center.lat;
      view.lon = decided.center.lon;
      viewRef.current = view;
      const label = decided.label ?? (await localityOrCoordinates(view.lat, view.lon));
      if (controller.signal.aborted) return;
      publishLabel(label);
      const center = { lon: view.lon, lat: view.lat };
      // NSW mode: a cut whose centre is in NSW uses NSW open data; Victoria (and anywhere else) is unchanged.
      const nswMode = detectRegion(center).region === "nsw";
      const terrainTask = layers.terrain
        ? fetchTerrainForCut(center, sideM, controller.signal)
            .then((field) => ({ field, error: null as string | null }))
            .catch((err: unknown) => {
              if (controller.signal.aborted) throw err;
              const message = err instanceof Error ? err.message : TERRAIN_UNAVAILABLE;
              return { field: null, error: message };
            })
        : Promise.resolve({ field: null, error: null as string | null });
      const bounds = squareBBox(view, sideM);
      const buildingsTask = modelLayers.buildings
        ? fetchOvertureBuildingsForCut(bounds, center, sideM, controller.signal, frameShapeRef.current)
        : Promise.resolve({
            buildings: [],
            buildingCapHit: false,
            stats: {
              release: "",
              tileCount: 0,
              fetchMs: 0,
              fragmentCount: 0,
              buildingCount: 0,
              hasMicrosoftFootprints: false,
            },
          });
      const transportTask = modelLayers.roads
        ? fetchOvertureTransportationForCut(bounds, center, sideM, controller.signal, frameShapeRef.current)
        : Promise.resolve({
            roads: [],
            roadKm: 0,
            roundabouts: [],
            stats: { release: "", tileCount: 0, fetchMs: 0, segmentCount: 0, skippedTomTom: 0 },
          });
      const loadTreeTiers = wantsOverture;
      const emptyBase = {
        areas: [],
        carParks: [],
        treeContext: { canopy: [], buildings: [], water: [], roads: [] },
        overtureTrees: [],
        stats: {
          release: "",
          tileCount: 0,
          fetchMs: 0,
          waterCount: 0,
          greenCount: 0,
          overtureTreeCount: 0,
          hasEsaLandCover: false,
        },
      };
      // A failed base tile read used to reject the whole model. Now water, green, OSM tree points and
      // canopy infill are dropped with a visible note, and the rest of the model still builds.
      const baseTask: Promise<Awaited<ReturnType<typeof fetchOvertureBaseForCut>> & { error: string | null }> =
        modelLayers.waterGreen || loadTreeTiers
          ? fetchOvertureBaseForCut(
              bounds,
              center,
              sideM,
              {
                waterGreen: modelLayers.waterGreen,
                trees: loadTreeTiers,
                frameShape: frameShapeRef.current,
              },
              controller.signal,
            )
              .then((result) => ({ ...result, error: null as string | null }))
              .catch((err: unknown) => {
                if (controller.signal.aborted) throw err;
                const detail = err instanceof Error && err.message ? ` ${err.message}` : "";
                return {
                  ...emptyBase,
                  error: `Overture base map could not be loaded, so water, green space, OpenStreetMap tree points and canopy infill are missing.${detail}`,
                };
              })
          : Promise.resolve({ ...emptyBase, error: null as string | null });
      const enrichmentTask = modelLayers.buildings
        ? fetchBuildingEnrichmentForCut(bounds, controller.signal)
        : Promise.resolve({ byId: new Map(), error: null as string | null });
      const enrichmentManifestTask = modelLayers.buildings
        ? fetchEnrichmentManifest(controller.signal)
        : Promise.resolve(null);
      const useTierTask = modelLayers.buildings && !nswMode
        ? loadUseTiers(bounds, center, { signal: controller.signal }).catch((err: unknown) => {
            if (controller.signal.aborted) throw err;
            const failures: UseTierFailure[] = [
              { id: "zone", tier: "zone", message: "zones unavailable" },
            ];
            return { zones: null, failures };
          })
        : Promise.resolve({ zones: null, failures: [] as UseTierFailure[] });
      // Trees come from the pre-baked Greater Melbourne file first (treesPrebake.ts). When it is
      // missing, fails, or does not cover the cut, the live servers are the backup: each tree page
      // has its own time limit (treeSourceFetch.ts) and a failure becomes a note in the Tree sizes panel.
      const prebakeTask: Promise<PrebakeResult | null> = loadTreeTiers && !nswMode
        ? loadPrebakedTrees(bounds, controller.signal)
        : Promise.resolve(null);
      const comTask = prebakeTask.then((prebake) => {
        if (!loadTreeTiers || nswMode) return { rows: [] as ComTree[], partial: false, error: null as string | null };
        if (prebake?.ok) return { rows: prebake.trees.com, partial: false, error: null as string | null };
        return fetchComTreesDetailed(bounds, controller.signal).catch((err: unknown) => {
          if (controller.signal.aborted) throw err;
          return {
            rows: [] as ComTree[],
            partial: false,
            error: err instanceof Error ? err.message : "City of Melbourne tree records could not be loaded.",
          };
        });
      });
      // Contours also load for Terrain: the 3D ground is built from Vicmap metro contours when they cover the cut.
      const contourTask = (layers.contours || layers.terrain) && nswMode
        ? loadNswContoursForCut({
            center,
            sideM,
            bounds,
            signal: controller.signal,
            terrain: () => terrainTask.then((result) => result.field),
          }).catch((err: unknown) => {
            if (controller.signal.aborted) throw err;
            return null;
          })
        : layers.contours || layers.terrain
        ? loadContoursForCut({
            center,
            sideM,
            bounds,
            signal: controller.signal,
            terrain: () => terrainTask.then((result) => result.field),
          }).catch((err: unknown) => {
            if (controller.signal.aborted) throw err;
            return null;
          })
        : Promise.resolve(null);
      const vicmapTask = prebakeTask.then((prebake) => {
        if (!loadTreeTiers || nswMode) return { rows: [] as VicmapPoint[], partial: false, error: null as string | null };
        if (prebake?.ok) return { rows: prebake.trees.vicmap, partial: false, error: null as string | null };
        return fetchVicmapTreesDetailed(bounds, controller.signal).catch((err: unknown) => {
          if (controller.signal.aborted) throw err;
          return {
            rows: [] as VicmapPoint[],
            partial: false,
            error: err instanceof Error ? err.message : "Vicmap tree points could not be loaded, so that tier is missing.",
          };
        });
      });
      const nswTask: Promise<NswLayers | null> = nswMode
        ? fetchNswLayers(center, sideM, { signal: controller.signal, frameShape: frameShapeRef.current }).catch((err: unknown) => {
            if (controller.signal.aborted) throw err;
            return null;
          })
        : Promise.resolve(null);
      const tramTask = modelLayers.roads && !nswMode
        ? fetchTramLinesForCut(
            { center, sideM, frameShape: frameShapeRef.current, placeLabel: label, layers: modelLayers, buildings: [], roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "" },
            bounds,
            controller.signal,
          )
        : Promise.resolve({ lines: null, loadFailed: false });
      const comFetchBounds = paddedComFetchBounds(center, sideM);
      const damTask = modelLayers.buildings && !nswMode
        ? fetchDevelopmentFloorRecords(comFetchBounds, controller.signal)
            .then((records) => ({ records, error: null as string | null }))
            .catch((err: unknown) => {
              if (controller.signal.aborted) throw err;
              const message =
                err instanceof Error
                  ? err.message
                  : "City of Melbourne development records could not be loaded.";
              return { records: [], error: message };
            })
        : Promise.resolve({ records: [], error: null as string | null });
      const comHeightsTask =
        modelLayers.buildings && intersectsComCity(comFetchBounds)
          ? fetchComBuildingFootprintsWithStats(comFetchBounds, center, controller.signal)
              .then((result) => ({
                footprints: result.footprints,
                fetchMs: result.stats.fetchMs,
                error: null as string | null,
              }))
              .catch((err: unknown) => {
                if (controller.signal.aborted) throw err;
                const message =
                  err instanceof Error
                    ? err.message
                    : "City of Melbourne 2023 building footprints could not be loaded.";
                return { footprints: [], fetchMs: 0, error: message };
              })
          : Promise.resolve({ footprints: [], fetchMs: 0, error: null as string | null });
      let completedFetchCount = 0;
      const totalFetchCount = 14;
      const trackFetch = <T extends Promise<unknown>>(task: T): T =>
        task.then((res) => {
          completedFetchCount += 1;
          if (!isDomTestStart && typeof window !== "undefined") {
            const p = 0.06 + (completedFetchCount / totalFetchCount) * 0.48;
            window.__citycutLoadProgress = Math.max(window.__citycutLoadProgress ?? 0, p);
          }
          return res;
        }) as T;
      const [
        terrainResult,
        comResult,
        vicmapResult,
        useTiers,
        enrichmentResult,
        enrichmentManifest,
        contourLayer,
        overtureResult,
        transportResult,
        baseResult,
        tramResult,
        damResult,
        comHeightsResult,
        nswResult,
      ] = await Promise.all([
        trackFetch(terrainTask),
        trackFetch(comTask),
        trackFetch(vicmapTask),
        trackFetch(useTierTask),
        trackFetch(enrichmentTask),
        trackFetch(enrichmentManifestTask),
        trackFetch(contourTask),
        trackFetch(buildingsTask),
        trackFetch(transportTask),
        trackFetch(baseTask),
        trackFetch(tramTask),
        trackFetch(damTask),
        trackFetch(comHeightsTask),
        trackFetch(nswTask),
      ]);
      const prebake = await prebakeTask;
      // OSM points from the file only when it was baked from the same Overture release as the
      // base tiles this cut read; otherwise the base tile's own points are used, as before.
      const prebakeOsm =
        prebake?.ok && baseResult.stats.release && prebake.trees.manifest.sourceStamps?.overtureRelease === baseResult.stats.release
          ? overtureTreesFromPoints(prebake.trees.osm, center, sideM, frameShapeRef.current)
          : null;
      const overtureBuildings = overtureResult.buildings;
      let buildingsWithoutCom: typeof overtureBuildings | undefined;
      let buildings: typeof overtureBuildings = [];
      const comFootprintPrefetch =
        comHeightsResult.footprints.length > 0 ? comHeightsResult.footprints : undefined;
      let comFootprintFetchError: string | null = comHeightsResult.error;
      if (
        !comFootprintFetchError &&
        modelLayers.buildings &&
        intersectsComCity(comFetchBounds) &&
        comHeightsResult.footprints.length === 0
      ) {
        comFootprintFetchError = "City of Melbourne 2023 building footprints returned no data.";
      }
      let enrichmentTilesFailed = false;
      if (enrichmentResult.error) {
        enrichmentTilesFailed = true;
        console.warn(`[CityCut enrichment] ${enrichmentResult.error}`);
      }
      const coverageMsg = cutCenterOutsideBuiltBbox(center, enrichmentManifest)
        ? enrichmentCoverageMessage(enrichmentManifest)
        : null;
      const useTierFailures = buildEnrichmentUseTierFailures({
        baseFailures: useTiers.failures,
        enrichmentError: enrichmentResult.error,
        coverageMessage: coverageMsg,
        zonesFetchIncomplete: enrichmentManifest?.zonesFetch?.complete === false,
      });
      let comHeightsAppliedAtCreate = false;
      let buildingsHeightResolvedAtCreate = false;
      let comWorkerPromise: Promise<Awaited<ReturnType<typeof runComBuildingHeightsInWorker>> | null> | null = null;
      let withLidarRef: typeof overtureBuildings = [];
      if (modelLayers.buildings) {
        await yieldToBrowserFrame(isDomTestStart);
        if (controller.signal.aborted) return;
        const enriched = mergeBuildingEnrichment(overtureBuildings, enrichmentResult.byId);
        const zoned = assignExternalUses(enriched, useTiers.zones);
        const withLidar = applyLidarHeightsFromEnrichment(zoned);
        withLidarRef = withLidar;
        buildingsWithoutCom = structuredClone(withLidar);
        if (
          !isDomTestStart &&
          comFootprintPrefetch &&
          comFootprintPrefetch.length > 0 &&
          typeof Worker !== "undefined"
        ) {
          comWorkerPromise = runComBuildingHeightsInWorker(
            withLidar,
            comFootprintPrefetch,
            controller.signal,
            { center, damRecords: damResult.records },
          ).catch(() => null);
        } else {
          buildings = applyDevelopmentFloorsToBuildings(withLidar, center, damResult.records);
        }
      }
      if (!isDomTestStart && typeof window !== "undefined") {
        window.__citycutLoadProgress = Math.max(window.__citycutLoadProgress ?? 0, 0.62);
      }
      await yieldToBrowserFrame(isDomTestStart);
      if (controller.signal.aborted) return;
      const treeContext = {
        ...baseResult.treeContext,
        roads: transportResult.roads.map((road) => ({ line: road.line, width: road.width })),
        buildings: overtureBuildings.map((building) => ({
          ring: building.ring,
          holes: building.holes,
        })),
      };
      const assembled = loadTreeTiers
        ? assembleTreeTiers({
            com: comRecordsToTrees(comResult.rows, center, sideM, frameShapeRef.current),
            osm: prebakeOsm ?? baseResult.overtureTrees,
            vicmap: vicmapPointsToTrees(vicmapResult.rows, center, sideM, frameShapeRef.current),
            ...treeContext,
          })
        : null;
      const trees = assembled ? assembled.trees : [];
      if (!isDomTestStart && typeof window !== "undefined") {
        window.__citycutLoadProgress = Math.max(window.__citycutLoadProgress ?? 0, 0.68);
      }
      await yieldToBrowserFrame(isDomTestStart);
      if (controller.signal.aborted) return;
      const contours = Boolean(layers.contours && contourLayer && contourLayer.lines.length > 0);
      // Test version: the 3D ground (and so building bases and plan shadows, which all sample
      // model.terrain) comes from Vicmap metro 1–5 m contours where they cover the cut.
      // ?ground=dem keeps the Mapterhorn DEM for comparison.
      const groundDem = new URLSearchParams(window.location.search).get("ground") === "dem";
      const contourGround =
        layers.terrain && !groundDem && contourLayer ? contourTerrain(contourLayer, sideM, terrainResult.field) : null;
      if (!isDomTestStart && typeof window !== "undefined") {
        window.__citycutLoadProgress = Math.max(window.__citycutLoadProgress ?? 0, 0.74);
      }
      if (modelLayers.buildings && !isDomTestStart) {
        if (comWorkerPromise) {
          const workerRes = await comWorkerPromise;
          if (controller.signal.aborted) return;
          if (workerRes?.buildings) {
            buildings = workerRes.resolved
              ? workerRes.buildings
              : resolveBuildingHeightsAfterCom(
                  workerRes.buildings,
                  center,
                  comFootprintPrefetch ?? [],
                  damResult.records,
                );
            comHeightsAppliedAtCreate = true;
            buildingsHeightResolvedAtCreate = true;
          } else {
            buildings = resolveBuildingHeightsAfterCom(
              withLidarRef,
              center,
              [],
              damResult.records,
            );
            buildingsHeightResolvedAtCreate = true;
          }
        } else {
          await yieldToBrowserFrame(isDomTestStart);
          if (controller.signal.aborted) return;
          buildings = resolveBuildingHeightsAfterCom(
            withLidarRef,
            center,
            [],
            damResult.records,
          );
          buildingsHeightResolvedAtCreate = true;
        }
      }
      if (!isDomTestStart && typeof window !== "undefined") {
        window.__citycutLoadProgress = Math.max(window.__citycutLoadProgress ?? 0, 0.79);
      }
      const groundField = contourGround?.field ?? terrainResult.field;
      const terrainNotice =
        layers.terrain && !groundDem ? contourTerrainNotice(contourGround, contourLayer, Boolean(terrainResult.field)) : null;
      let sourceNote = FLAT_GROUND_NOTE;
      if (contourGround && nswMode) {
        sourceNote = `Ground is interpolated from ${contourGroundSourceName(contourLayer!)} (Laplace on a ${contourGround.field.spacingM.toFixed(1)} m grid, ${Math.round(contourGround.coverage * 100)}% contour-supported${terrainResult.field ? "; Mapterhorn DEM elsewhere" : ""}). Elevations ${contourGround.field.min.toFixed(1)}–${contourGround.field.max.toFixed(1)} m AHD. Each building sits on the lowest sample along its footprint.`;
      } else if (contourGround) {
        sourceNote = `Ground is interpolated from Vicmap metro ${contourLayer!.interval} m contours (Laplace on a ${contourGround.field.spacingM.toFixed(1)} m grid, ${Math.round(contourGround.coverage * 100)}% contour-supported${terrainResult.field ? "; Mapterhorn DEM elsewhere" : ""}). Elevations ${contourGround.field.min.toFixed(1)}–${contourGround.field.max.toFixed(1)} m AHD. Each building sits on the lowest sample along its footprint.`;
      } else if (terrainResult.field) {
        sourceNote = terrainNote(terrainResult.field, contourLayer?.source === "dem");
      }
      const release =
        overtureResult.stats.release ||
        transportResult.stats.release ||
        baseResult.stats.release;
      if (wantsOverture && release) {
        sourceNote = `${sourceNote} Map features from Overture Maps (${release}): buildings z14, transportation z14, base z13. ${overtureThemeCredit({
          hasMicrosoftFootprints: overtureResult.stats.hasMicrosoftFootprints,
          hasEsaLandCover: baseResult.stats.hasEsaLandCover,
        })}.`;
      }
      if (modelLayers.buildings && nswMode) {
        sourceNote = `${sourceNote} ${NSW_BUILDING_ESTIMATE_NOTE}`;
      } else if (modelLayers.buildings) {
        logLidarEnrichmentStatus(enrichmentManifest);
        sourceNote = `${sourceNote} Building height uses CoM 2023 measured footprints (always applied in Melbourne), then the LiDAR (Vicmap, licensed) tier (${lidarLegendLine(enrichmentManifest).toLowerCase()}), then CoM development floors × 3 m for one building per completed development (approved or under-construction records are ignored), then Overture height, num_floors × 3 m, otherwise Vicmap zone defaults labelled as estimates (3 m under 40 m², else by zone, else 9 m). Manual height edits override every other source. Use follows offline enrichment tiles (Overture class, CoM CLUE, Vicmap zone), with live zones when tiles fail.`;
      }
      if (damResult.error) sourceNote = `${sourceNote} ${damResult.error}`;
      if (comHeightsResult.error) sourceNote = `${sourceNote} ${comHeightsResult.error}`;
      const heightSourceLoadWarnings = buildHeightSourceLoadWarnings({
        buildingsLayer: modelLayers.buildings,
        comBounds: comFetchBounds,
        comError: comHeightsResult.error,
        comFootprintCount: comHeightsResult.footprints.length,
        damError: damResult.error,
      });
      if (tramResult.loadFailed) {
        heightSourceLoadWarnings.push("PTV tram routes failed to load.");
      }
      if (nswMode && modelLayers.buildings) heightSourceLoadWarnings.push(NSW_BUILDING_ESTIMATE_NOTE);
      const nswWater = nswMode && modelLayers.waterGreen ? nswWaterAreas(baseResult.areas, nswResult) : null;
      if (nswMode) sourceNote = `${sourceNote} ${nswSourceNote(nswResult)}`;
      if (nswWater?.note) sourceNote = `${sourceNote} ${nswWater.note}`;
      const buildingCapHit = overtureResult.buildingCapHit;
      if (buildingCapHit) sourceNote = `${sourceNote} Building count was capped at 4000.`;
      if (contourLayer && contourLayer.source !== "dem") {
        sourceNote = `${sourceNote} Contours are ${contourLayer.label}, every ${contourLayer.interval} m. ${contourLayer.attribution}`;
      }
      if (modelLayers.trees) sourceNote = replaceTreeNote(sourceNote, trees);
      if (assembled?.capHit) {
        sourceNote = `${sourceNote} Tree count was capped at ${MAX_TREE_INSTANCES}. Canopy infill was trimmed first, then Vicmap.`;
      }
      const treeLoadNotes = treeSourceLoadNotes({
        com: comResult.error,
        vicmap: vicmapResult.error,
        base: baseResult.error,
      });
      const treeBackupNote = loadTreeTiers && prebake && !prebake.ok ? prebakeBackupNote(prebake.reason) : null;
      if (treeBackupNote) {
        treeLoadNotes.unshift({ source: "prebake", message: treeBackupNote });
        console.warn(`[CityCut trees] ${treeBackupNote}`);
      } else if (prebake?.ok) {
        sourceNote = `${sourceNote} ${prebakeSourceNote(prebake.trees.manifest, prebakeOsm !== null)}`;
      }
      for (const note of treeLoadNotes) sourceNote = `${sourceNote} ${note.message}`;
      if (treeTierCounts(trees).com > 0) sourceNote = `${sourceNote} ${COM_TREES_CREDIT}.`;
      if (treeTierCounts(trees).vicmap > 0) sourceNote = `${sourceNote} ${VICMAP_ATTRIBUTION}`;
      if (prebakeOsm && treeTierCounts(trees).osm > 0) sourceNote = `${sourceNote} ${OSM_TREES_ODBL_CREDIT}`;
      if (useTiers.failures.length > 0) {
        sourceNote = `${sourceNote} ${useTiers.failures
          .map((failure) => failure.message.charAt(0).toUpperCase() + failure.message.slice(1))
          .join(". ")}.`;
      }
      let siteAnchor: LonLat | null = null;
      let siteParcelPfi: string | null = null;
      let siteParcelSpi: string | null = null;
      let siteBoundaryLines: CityModel["siteBoundaryLines"];
      let siteBuildingIds: number[] | undefined;
      let siteNote: string | null = null;
      let siteBuildingQa: CityModel["siteBuildingQa"];
      const urlSite = typeof window !== "undefined" ? siteAnchorFromSearch(window.location.search) : null;
      const searchAnchor =
        anchorRef.current && shouldResolveSite(anchorRef.current, urlSite)
          ? anchorRef.current
          : urlSite
            ? { lat: urlSite.lat, lon: urlSite.lon, label: label }
            : null;
      if (searchAnchor && modelLayers.buildings) {
        siteAnchor = { lat: searchAnchor.lat, lon: searchAnchor.lon };
        const site = await resolveSiteFrame({
          anchor: siteAnchor,
          center,
          sideM,
          buildings,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        siteParcelPfi = site.parcel?.parcelPfi ?? null;
        siteParcelSpi = site.parcel?.parcelSpi ?? null;
        siteBoundaryLines = site.parcel?.boundaryLines;
        siteBuildingIds = site.siteBuildingIds;
        siteNote = site.note;
        const attribution = siteAttributionNote(site);
        if (attribution) sourceNote = `${sourceNote} ${attribution}`;
        if (siteParcelPfi) {
          const spi = siteParcelSpi ? ` SPI ${siteParcelSpi}` : "";
          sourceNote = `${sourceNote} Site parcel PFI ${siteParcelPfi}${spi}.`;
        }
        if (siteNote) sourceNote = `${sourceNote} ${siteNote}`;
        if (
          typeof window !== "undefined" &&
          qaModeFromSearch(window.location.search) &&
          site.parcel
        ) {
          siteBuildingQa = siteBuildingOverlaps(buildings, site.parcel.polygons);
        }
        writeUrl(siteAnchor);
      }
      // NSW mode: official building use from Spatial Services building complex points where present.
      const nswUse = nswMode && modelLayers.buildings ? nswApplyBuildingUse(buildings, nswResult) : null;
      if (nswUse) buildings = nswUse.buildings;
      const draftModel: CityModel = {
        center,
        sideM,
        frameShape: frameShapeRef.current,
        layers: modelLayers,
        buildings,
        roads: modelLayers.roads ? transportResult.roads : [],
        tramLines: nswMode ? (modelLayers.roads && nswLightRailLines(nswResult).length > 0 ? nswLightRailLines(nswResult) : undefined) : tramResult.lines ?? undefined,
        tramLinesLoadFailed: tramResult.loadFailed || undefined,
        areas: modelLayers.waterGreen ? withRoundaboutIslands(nswWater ? nswWater.areas : baseResult.areas, modelLayers.roads ? (transportResult.roundabouts ?? []) : [], { sideM, shape: frameShapeRef.current }) : [],
        carParks: modelLayers.waterGreen ? baseResult.carParks : undefined,
        trees,
        roadKm: modelLayers.roads ? transportResult.roadKm : 0,
        buildingCapHit,
        treeCapHit: assembled?.capHit ?? false,
        treeLoadNotes: treeLoadNotes.length > 0 ? treeLoadNotes : undefined,
        treeSource: !loadTreeTiers || !prebake
          ? undefined
          : prebake.ok
            ? {
                kind: "prebake",
                builtAt: isoDay(prebake.trees.manifest.generatedAt),
                vicmapDate: isoDay(prebake.trees.manifest.sourceStamps?.vicmapDataLastEdit),
                comDate: isoDay(prebake.trees.manifest.sourceStamps?.comDataProcessed),
                osmFromFile: prebakeOsm !== null,
              }
            : { kind: "live", reason: prebake.reason },
        placeLabel: label,
        sourceNote,
        terrain: groundField,
        terrainError: terrainResult.error,
        terrainNotice,
        useTierFailures,
        enrichmentTilesFailed,
        lidarHeightTierNote: modelLayers.buildings ? lidarLegendLine(enrichmentManifest) : undefined,
        contours,
        contourLayer: layers.contours ? contourLayer : null,
        hasMicrosoftFootprints: overtureResult.stats.hasMicrosoftFootprints,
        hasEsaLandCover: baseResult.stats.hasEsaLandCover,
        siteAnchor,
        siteParcelPfi,
        siteParcelSpi,
        siteBoundaryLines,
        siteBuildingIds,
        siteNote,
        siteBuildingQa,
        developmentDamRecords: damResult.records.length > 0 ? damResult.records : undefined,
        buildingsWithoutCom,
        comBuildingHeightsApplied: comHeightsAppliedAtCreate,
        buildingsHeightResolved: buildingsHeightResolvedAtCreate || undefined,
        comFootprintPrefetch,
        comFootprintFetchError: comFootprintFetchError ?? undefined,
        heightSourceLoadWarnings:
          heightSourceLoadWarnings.length > 0 ? heightSourceLoadWarnings : undefined,
        ...(nswMode ? { region: "nsw" as const, nsw: nswResult, nswWaterNote: nswWater?.note ?? null, nswUseMatched: nswUse?.matched ?? 0 } : {}),
      };
      if (modelLayers.roads) {
        await yieldToBrowserFrame(isDomTestStart);
        if (controller.signal.aborted) return;
        draftModel.blocks = computeCityBlocks(draftModel);
      }
      if (!isDomTestStart && typeof window !== "undefined") {
        window.__citycutLoadProgress = Math.max(window.__citycutLoadProgress ?? 0, 0.84);
      }
      if (nswMode && modelLayers.roads && (nswResult?.roadCorridors.length ?? 0) > 0) {
        draftModel.nswRoadSurface = groundRoadPartition(draftModel).sources ?? null;
      }
      const isAutomatedDomTest =
        typeof navigator !== "undefined" && /jsdom|HappyDOM/i.test(navigator.userAgent ?? "");
      const prefersReduced =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isQa = typeof window !== "undefined" && qaModeFromSearch(window.location.search);
      if (!isAutomatedDomTest && !prefersReduced && !isQa) {
        await preloadModelPage().catch(() => undefined);
        if (controller.signal.aborted) return;
        const minSilentMs = typeof window !== "undefined" && typeof window.__citycutMinSilentLoadMs === "number" ? window.__citycutMinSilentLoadMs : 0;
        if (minSilentMs > 0) {
          const elapsedSilent = performance.now() - createClickMs;
          if (elapsedSilent < minSilentMs) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, minSilentMs - elapsedSilent));
          }
          if (controller.signal.aborted) return;
        }
        if (typeof window !== "undefined") {
          window.__citycutModelPrewarmMounted = true;
        }
        setHandoffUnderlay("holding");
      }
      await yieldToBrowserFrame(isDomTestStart);
      if (controller.signal.aborted) return;
      setModel(draftModel);
      setPhase("model");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not build the model.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }

  const [selectCollapsed] = useSidebarCollapsed();
  const headerPlace = phase === "model" && model ? model.placeLabel : placeLabel;
  const headerSide = phase === "model" && model ? model.sideM : sideKm * 1000;
  const headerShape = phase === "model" && model ? (model.frameShape ?? "square") : frameShape;
  const headerSize = cutSizeLabel(headerSide, headerShape);

  useEffect(() => {
    document.title = `CityCut — ${headerPlace} · ${headerSize}`;
  }, [headerPlace, headerSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
    if (/jsdom|HappyDOM/i.test(ua)) return;
    const id = window.setTimeout(() => {
      void preloadModelPage();
    }, 120);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (phase !== "model" || handoffUnderlay === "none") return;
    const triggerFade = () => {
      setHandoffUnderlay((prev) => (prev === "holding" ? "fading" : prev));
      selectRootRef.current?.classList.add("is-loading", "is-fading-out");
    };
    const onIntroDone = () => {
      setHandoffUnderlay("none");
    };
    if (typeof window !== "undefined" && window.__citycutIntroStarted) {
      triggerFade();
    }
    const onSafetyTimeout = () => {
      if (
        typeof window !== "undefined" &&
        (window as Window & { __citycutIntroPaused?: boolean }).__citycutIntroPaused
      ) {
        return;
      }
      if (typeof window !== "undefined" && !window.__citycutIntroStarted) {
        window.__citycutIntroStarted = true;
        window.__citycutIntroStartMs = performance.now();
        window.dispatchEvent(new CustomEvent("citycut:intro-start"));
      }
      setHandoffUnderlay("none");
    };
    window.addEventListener("citycut:intro-start", triggerFade);
    window.addEventListener("citycut:intro-done", onIntroDone);
    const safetyTimer = window.setTimeout(onSafetyTimeout, 45000);
    return () => {
      window.removeEventListener("citycut:intro-start", triggerFade);
      window.removeEventListener("citycut:intro-done", onIntroDone);
      window.clearTimeout(safetyTimer);
    };
  }, [phase, handoffUnderlay]);

  const showSelectLayer = phase === "select" || handoffUnderlay !== "none";
  const selectTransitionActive = phase === "model" && handoffUnderlay === "fading";
  const selectBusy = loading || (phase === "model" && handoffUnderlay !== "none");
  const selectProcessingPhaseA = selectBusy && !selectTransitionActive;

  return (
    <div className="app">
      {showSelectLayer ? (
        <div
          ref={selectRootRef}
          className={[
            "select",
            selectCollapsed ? "sidebar-collapsed" : "",
            selectProcessingPhaseA ? "is-processing-phase-a" : "",
            selectTransitionActive ? "is-loading" : "",
            phase === "model" && handoffUnderlay !== "none" ? "is-handoff-underlay" : "",
            phase === "model" && handoffUnderlay === "fading" ? "is-fading-out" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={phase === "model" ? "true" : undefined}
        >
          <MapStage
            basemap={basemap}
            fitFrameOnLoad={fitFrameOnLoad}
            sideM={sideKm * 1000}
            frameShape={frameShape}
            initialView={viewRef.current}
            fly={fly}
            loading={selectBusy}
            processing={selectProcessingPhaseA}
            fadingOut={selectTransitionActive}
            siteSearch={mapSiteSearch}
            onCancel={cancel}
            onView={onView}
            onFlyLanded={onFlyLanded}
          />
          <SelectChrome
            placeLabel={placeLabel}
            sideKm={sideKm}
            layers={layers}
            loading={selectBusy}
            error={error}
            onSideKm={setSideKm}
            frameShape={frameShape}
            onFrameShape={setFrameShape}
            onLayer={onLayer}
            onPlace={onPlace}
            onCreate={createModel}
            basemap={basemap}
            onBasemap={onBasemap}
            center={cutCenter}
            onHome={onHome}
          />
          {selectProcessingPhaseA && (
            <div
              className="loading-hud-pill is-processing hud-card"
              role="status"
              aria-live="polite"
              data-phase="processing"
            >
              <div className="loading-hud-row">
                <span className="loading-pulse-dot is-processing" aria-hidden="true" />
                <strong>Processing site data &amp; 3D geometry…</strong>
                <div className="loading-prog-track is-indeterminate" aria-hidden="true">
                  <div className="loading-prog-shimmer" />
                </div>
                <span className="loading-prog-pct mono">PREP</span>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {phase === "model" && model ? (
        <Suspense fallback={handoffUnderlay !== "none" ? null : <p className="opening">Opening the model…</p>}>
          <ModelPage
            model={model}
            onHome={() => {
              setHandoffUnderlay("none");
              onHome();
            }}
            onNewCut={() => {
              setHandoffUnderlay("none");
              setPhase("select");
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
