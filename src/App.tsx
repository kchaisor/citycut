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
import { buildHeightSourceLoadWarnings } from "./lib/buildHeightSourceLoadWarnings";
import { buildEnrichmentUseTierFailures } from "./lib/enrichmentUseTierFailures";
import type { Basemap, CityModel, LonLat, PlaceHit, UiLayers, UseTierFailure, ViewState } from "./types";

function frameFromQuery(): FrameQuery | null {
  if (typeof window === "undefined") return null;
  return frameFromSearch(window.location.search);
}

const ModelPage = lazy(() => import("./components/ModelPage").then((mod) => ({ default: mod.ModelPage })));

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
      const useTierTask = modelLayers.buildings
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
      const prebakeTask: Promise<PrebakeResult | null> = loadTreeTiers
        ? loadPrebakedTrees(bounds, controller.signal)
        : Promise.resolve(null);
      const comTask = prebakeTask.then((prebake) => {
        if (!loadTreeTiers) return { rows: [] as ComTree[], partial: false, error: null as string | null };
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
      const contourTask = layers.contours
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
        if (!loadTreeTiers) return { rows: [] as VicmapPoint[], partial: false, error: null as string | null };
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
      const tramTask = modelLayers.roads
        ? fetchTramLinesForCut(
            { center, sideM, frameShape: frameShapeRef.current, placeLabel: label, layers: modelLayers, buildings: [], roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "" },
            bounds,
            controller.signal,
          )
        : Promise.resolve({ lines: null, loadFailed: false });
      const comFetchBounds = paddedComFetchBounds(center, sideM);
      const damTask = modelLayers.buildings
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
      ] = await Promise.all([
        terrainTask,
        comTask,
        vicmapTask,
        useTierTask,
        enrichmentTask,
        enrichmentManifestTask,
        contourTask,
        buildingsTask,
        transportTask,
        baseTask,
        tramTask,
        damTask,
        comHeightsTask,
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
      if (modelLayers.buildings) {
        const enriched = mergeBuildingEnrichment(overtureBuildings, enrichmentResult.byId);
        const zoned = assignExternalUses(enriched, useTiers.zones);
        const withLidar = applyLidarHeightsFromEnrichment(zoned);
        buildingsWithoutCom = structuredClone(withLidar);
        buildings = applyDevelopmentFloorsToBuildings(withLidar, center, damResult.records);
      }
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
      const contours = Boolean(layers.contours && contourLayer && contourLayer.lines.length > 0);
      let sourceNote = FLAT_GROUND_NOTE;
      if (terrainResult.field) {
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
      if (modelLayers.buildings) {
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
      const draftModel: CityModel = {
        center,
        sideM,
        frameShape: frameShapeRef.current,
        layers: modelLayers,
        buildings,
        roads: modelLayers.roads ? transportResult.roads : [],
        tramLines: tramResult.lines ?? undefined,
        tramLinesLoadFailed: tramResult.loadFailed || undefined,
        areas: modelLayers.waterGreen ? withRoundaboutIslands(baseResult.areas, modelLayers.roads ? (transportResult.roundabouts ?? []) : [], { sideM, shape: frameShapeRef.current }) : [],
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
        terrain: terrainResult.field,
        terrainError: terrainResult.error,
        useTierFailures,
        enrichmentTilesFailed,
        lidarHeightTierNote: modelLayers.buildings ? lidarLegendLine(enrichmentManifest) : undefined,
        contours,
        contourLayer,
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
        comBuildingHeightsApplied: false,
        comFootprintPrefetch,
        comFootprintFetchError: comFootprintFetchError ?? undefined,
        heightSourceLoadWarnings:
          heightSourceLoadWarnings.length > 0 ? heightSourceLoadWarnings : undefined,
      };
      if (modelLayers.roads) {
        draftModel.blocks = computeCityBlocks(draftModel);
      }
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

  return (
    <div className="app">
      {phase === "select" ? (
        <div className={selectCollapsed ? "select sidebar-collapsed" : "select"}>
          <MapStage
            basemap={basemap}
            fitFrameOnLoad={fitFrameOnLoad}
            sideM={sideKm * 1000}
            frameShape={frameShape}
            initialView={viewRef.current}
            fly={fly}
            loading={loading}
            siteSearch={mapSiteSearch}
            onCancel={cancel}
            onView={onView}
            onFlyLanded={onFlyLanded}
          />
          <SelectChrome
            placeLabel={placeLabel}
            sideKm={sideKm}
            layers={layers}
            loading={loading}
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
        </div>
      ) : model ? (
        <Suspense fallback={<p className="opening">Opening the model…</p>}>
          <ModelPage model={model} onHome={onHome} onNewCut={() => setPhase("select")} />
        </Suspense>
      ) : null}
    </div>
  );
}
