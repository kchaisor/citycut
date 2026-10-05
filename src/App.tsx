import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MapStage, type FlyRequest } from "./components/MapStage";
import { SelectChrome } from "./components/SelectChrome";
import { TopBar } from "./components/TopBar";
import {
  DEFAULT_LAYERS,
  DEFAULT_SIDE_KM,
  DEFAULT_ZOOM,
  MAX_AREA_M2,
  MELBOURNE,
} from "./content/constants";
import { comRecordsToTrees, fetchComTrees } from "./lib/comTrees";
import { fetchTerrainForCut } from "./lib/fetchTerrain";
import { explicitLabel, frameFromSearch, writeFrameSearch, type FrameQuery } from "./lib/frameQuery";
import { squareBBox } from "./lib/geo";
import { localityCacheKey, reverseLocality } from "./lib/nominatim";
import { FLAT_GROUND_NOTE } from "./lib/parseOsm";
import { fetchOvertureBaseForCut } from "./lib/overtureBase";
import { overtureThemeCredit } from "./lib/overtureAttribution";
import { fetchOvertureTransportationForCut } from "./lib/overtureTransportation";
import {
  REVERSE_DEBOUNCE_MS,
  addressStillApplies,
  coordinateLabel,
  cutSizeLabel,
  resolveSearchedCut,
} from "./lib/placeLabel";
import { TERRAIN_UNAVAILABLE, terrainNote } from "./lib/terrain";
import { MAX_TREE_INSTANCES, assembleTreeTiers } from "./lib/treeTiers";
import { replaceTreeNote, treeTierCounts } from "./lib/trees";
import { fetchVicmapTrees, vicmapPointsToTrees, VICMAP_ATTRIBUTION } from "./lib/vicmapTrees";
import { loadContoursForCut } from "./lib/vicmapContours";
import { fetchOvertureBuildingsForCut } from "./lib/overtureBuildings";
import { assignExternalUses, loadUseTiers } from "./lib/useCascade";
import type { Basemap, CityModel, LonLat, PlaceHit, UiLayers, UseTierFailure, ViewState } from "./types";

function frameFromQuery(): FrameQuery | null {
  if (typeof window === "undefined") return null;
  return frameFromSearch(window.location.search);
}

const ModelPage = lazy(() => import("./components/ModelPage").then((mod) => ({ default: mod.ModelPage })));

type PlaceAnchor = LonLat & { label: string };

export default function App() {
  const queried = frameFromQuery();
  const initialView: ViewState = queried?.view ?? { ...MELBOURNE, zoom: DEFAULT_ZOOM };
  const sharedLabel = typeof window === "undefined" ? null : explicitLabel(window.location.search);
  const viewRef = useRef<ViewState>(initialView);
  const anchorRef = useRef<PlaceAnchor | null>(
    sharedLabel ? { lon: initialView.lon, lat: initialView.lat, label: sharedLabel } : null,
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
  const [layers, setLayers] = useState<UiLayers>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("map");
  const [placeLabel, setPlaceLabel] = useState(placeLabelRef.current);
  const [fly, setFly] = useState<FlyRequest | null>(null);
  const [phase, setPhase] = useState<"select" | "model">("select");
  const [model, setModel] = useState<CityModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  sideRef.current = sideKm;
  phaseRef.current = phase;
  placeLabelRef.current = placeLabel;

  function writeUrl() {
    const view = viewRef.current;
    const search = writeFrameSearch(window.location.search, {
      lat: view.lat,
      lon: view.lon,
      sideKm: sideRef.current,
      label: placeLabelRef.current,
    });
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
    if (sideM * sideM > MAX_AREA_M2 + 1) {
      setError("That frame is over the 2 km² limit for this version.");
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
        ? fetchOvertureBuildingsForCut(bounds, center, sideM, controller.signal)
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
        ? fetchOvertureTransportationForCut(bounds, center, sideM, controller.signal)
        : Promise.resolve({
            roads: [],
            roadKm: 0,
            stats: { release: "", tileCount: 0, fetchMs: 0, segmentCount: 0, skippedTomTom: 0 },
          });
      const baseTask =
        modelLayers.waterGreen || modelLayers.trees
          ? fetchOvertureBaseForCut(
              bounds,
              center,
              sideM,
              { waterGreen: modelLayers.waterGreen, trees: modelLayers.trees },
              controller.signal,
            )
          : Promise.resolve({
              areas: [],
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
            });
      const useTierTask = modelLayers.buildings
        ? loadUseTiers(bounds, center, { signal: controller.signal }).catch((err: unknown) => {
            if (controller.signal.aborted) throw err;
            const failures: UseTierFailure[] = [{ tier: "zone", message: "zones unavailable" }];
            return { zones: null, failures };
          })
        : Promise.resolve({ zones: null, failures: [] as UseTierFailure[] });
      const comTask = modelLayers.trees
        ? (() => {
            const comAbort = new AbortController();
            const comTimer = window.setTimeout(() => comAbort.abort(), 20000);
            const stopCom = () => comAbort.abort();
            controller.signal.addEventListener("abort", stopCom);
            return fetchComTrees(bounds, comAbort.signal)
              .then((rows) => ({ rows, error: null as string | null }))
              .catch((err: unknown) => {
                if (controller.signal.aborted) throw err;
                const message = comAbort.signal.aborted
                  ? "City of Melbourne tree records took too long, so that tier is missing."
                  : err instanceof Error
                    ? err.message
                    : "City of Melbourne tree records could not be loaded.";
                return { rows: [], error: message };
              })
              .finally(() => {
                window.clearTimeout(comTimer);
                controller.signal.removeEventListener("abort", stopCom);
              });
          })()
        : Promise.resolve({ rows: [], error: null as string | null });
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
      const vicmapTask = modelLayers.trees
        ? (() => {
            const vicmapAbort = new AbortController();
            const vicmapTimer = window.setTimeout(() => vicmapAbort.abort(), 20000);
            const stopVicmap = () => vicmapAbort.abort();
            controller.signal.addEventListener("abort", stopVicmap);
            return fetchVicmapTrees(bounds, vicmapAbort.signal)
              .then((points) => ({ points, error: null as string | null }))
              .catch((err: unknown) => {
                if (controller.signal.aborted) throw err;
                const message = vicmapAbort.signal.aborted
                  ? "Vicmap tree points took too long, so that tier is missing."
                  : err instanceof Error
                    ? err.message
                    : "Vicmap tree points could not be loaded, so that tier is missing.";
                return { points: [], error: message };
              })
              .finally(() => {
                window.clearTimeout(vicmapTimer);
                controller.signal.removeEventListener("abort", stopVicmap);
              });
          })()
        : Promise.resolve({ points: [], error: null as string | null });
      const [terrainResult, comResult, vicmapResult, useTiers, contourLayer, overtureResult, transportResult, baseResult] =
        await Promise.all([
          terrainTask,
          comTask,
          vicmapTask,
          useTierTask,
          contourTask,
          buildingsTask,
          transportTask,
          baseTask,
        ]);
      const overtureBuildings = overtureResult.buildings;
      const buildings = modelLayers.buildings
        ? assignExternalUses(overtureBuildings, useTiers.zones)
        : [];
      const half = sideM / 2;
      const treeContext = {
        ...baseResult.treeContext,
        roads: transportResult.roads.map((road) => ({ line: road.line, width: road.width })),
        buildings: overtureBuildings.map((building) => ({
          ring: building.ring,
          holes: building.holes,
        })),
      };
      const assembled = modelLayers.trees
        ? assembleTreeTiers({
            com: comRecordsToTrees(comResult.rows, center, half),
            osm: baseResult.overtureTrees,
            vicmap: vicmapPointsToTrees(vicmapResult.points, center, half),
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
        sourceNote = `${sourceNote} Building height uses Overture height, then num_floors × 3 m, otherwise Vicmap zone defaults (3 m under 40 m², else by zone, else 9 m). Use follows Overture class, then Vicmap planning zones.`;
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
      if (comResult.error) sourceNote = `${sourceNote} ${comResult.error}`;
      if (vicmapResult.error) sourceNote = `${sourceNote} ${vicmapResult.error}`;
      if (treeTierCounts(trees).vicmap > 0) sourceNote = `${sourceNote} ${VICMAP_ATTRIBUTION}`;
      if (useTiers.failures.length > 0) {
        sourceNote = `${sourceNote} ${useTiers.failures
          .map((failure) => failure.message.charAt(0).toUpperCase() + failure.message.slice(1))
          .join(". ")}.`;
      }
      setModel({
        center,
        sideM,
        layers: modelLayers,
        buildings,
        roads: modelLayers.roads ? transportResult.roads : [],
        areas: modelLayers.waterGreen ? baseResult.areas : [],
        trees,
        roadKm: modelLayers.roads ? transportResult.roadKm : 0,
        buildingCapHit,
        treeCapHit: assembled?.capHit ?? false,
        placeLabel: label,
        sourceNote,
        terrain: terrainResult.field,
        terrainError: terrainResult.error,
        useTierFailures: useTiers.failures,
        contours,
        contourLayer,
        hasMicrosoftFootprints: overtureResult.stats.hasMicrosoftFootprints,
        hasEsaLandCover: baseResult.stats.hasEsaLandCover,
      });
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

  const headerPlace = phase === "model" && model ? model.placeLabel : placeLabel;
  const headerSide = phase === "model" && model ? model.sideM : sideKm * 1000;
  const headerSize = cutSizeLabel(headerSide);

  useEffect(() => {
    document.title = `CityCut — ${headerPlace} · ${headerSize}`;
  }, [headerPlace, headerSize]);

  return (
    <div className="app">
      <TopBar
        showNewCut={phase === "model"}
        place={headerPlace}
        size={headerSize}
        onHome={onHome}
        onNewCut={() => setPhase("select")}
      />
      {phase === "select" ? (
        <div className="select">
          <MapStage
            basemap={basemap}
            sideM={sideKm * 1000}
            initialView={viewRef.current}
            fly={fly}
            loading={loading}
            onCancel={cancel}
            onView={onView}
            onBasemap={onBasemap}
            onFlyLanded={onFlyLanded}
          />
          <SelectChrome
            placeLabel={placeLabel}
            sideKm={sideKm}
            layers={layers}
            loading={loading}
            error={error}
            onSideKm={setSideKm}
            onLayer={onLayer}
            onPlace={onPlace}
            onCreate={createModel}
          />
        </div>
      ) : model ? (
        <Suspense fallback={<p className="opening">Opening the model…</p>}>
          <ModelPage model={model} />
        </Suspense>
      ) : null}
    </div>
  );
}
