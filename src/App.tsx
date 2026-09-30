import { lazy, Suspense, useRef, useState } from "react";
import { MapStage, type FlyRequest } from "./components/MapStage";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import {
  DEFAULT_LAYERS,
  DEFAULT_SIDE_KM,
  DEFAULT_ZOOM,
  MAX_AREA_M2,
  MELBOURNE,
  MELBOURNE_LABEL,
} from "./content/constants";
import { comRecordsToTrees, fetchComTrees } from "./lib/comTrees";
import { fetchTerrainForCut } from "./lib/fetchTerrain";
import { frameFromSearch, type FrameQuery } from "./lib/frameQuery";
import { M_PER_DEG_LAT, mPerDegLon, squareBBox } from "./lib/geo";
import { buildOverpassQuery, fetchOverpass, overpassBBox } from "./lib/overpass";
import { collectTreeContext, FLAT_GROUND_NOTE, parseCity } from "./lib/parseOsm";
import { TERRAIN_UNAVAILABLE, terrainNote } from "./lib/terrain";
import { MAX_TREE_INSTANCES, assembleTreeTiers } from "./lib/treeTiers";
import { replaceTreeNote, treeTierCounts } from "./lib/trees";
import { fetchVicmapTrees, vicmapPointsToTrees, VICMAP_ATTRIBUTION } from "./lib/vicmapTrees";
import { assignExternalUses, loadUseTiers } from "./lib/useCascade";
import type { Basemap, CityModel, PlaceHit, UiLayers, UseTierFailure, ViewState } from "./types";

function frameFromQuery(): FrameQuery | null {
  if (typeof window === "undefined") return null;
  return frameFromSearch(window.location.search);
}

const ModelPage = lazy(() => import("./components/ModelPage").then((mod) => ({ default: mod.ModelPage })));

export default function App() {
  const queried = frameFromQuery();
  const initialView: ViewState = queried?.view ?? { ...MELBOURNE, zoom: DEFAULT_ZOOM };
  const viewRef = useRef<ViewState>(initialView);
  const pinRef = useRef({ lon: initialView.lon, lat: initialView.lat });
  const pinLabelRef = useRef(queried?.label ?? MELBOURNE_LABEL);
  const driftedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [sideKm, setSideKm] = useState(queried?.sideKm ?? DEFAULT_SIDE_KM);
  const [layers, setLayers] = useState<UiLayers>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("map");
  const [placeLabel, setPlaceLabel] = useState(queried?.label ?? MELBOURNE_LABEL);
  const [fly, setFly] = useState<FlyRequest | null>(null);
  const [phase, setPhase] = useState<"select" | "model">("select");
  const [model, setModel] = useState<CityModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onView(view: ViewState) {
    viewRef.current = view;
    const dx = (view.lon - pinRef.current.lon) * mPerDegLon(view.lat);
    const dy = (view.lat - pinRef.current.lat) * M_PER_DEG_LAT;
    const drifted = Math.hypot(dx, dy) > 450;
    if (drifted !== driftedRef.current) {
      driftedRef.current = drifted;
      setPlaceLabel(drifted ? "Selected frame" : pinLabelRef.current);
    }
  }

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
    pinRef.current = { lon: place.lon, lat: place.lat };
    pinLabelRef.current = place.label;
    driftedRef.current = false;
    setPlaceLabel(place.label);
    setFly({
      token: Date.now(),
      lon: place.lon,
      lat: place.lat,
      bounds: place.bounds,
    });
  }

  function focusMelbourne() {
    pinRef.current = MELBOURNE;
    pinLabelRef.current = MELBOURNE_LABEL;
    driftedRef.current = false;
    setPlaceLabel(MELBOURNE_LABEL);
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
    const wantsOsm =
      modelLayers.buildings || modelLayers.roads || modelLayers.waterGreen || modelLayers.trees;
    if (!wantsOsm && !layers.terrain) {
      setError("Turn on Buildings, Roads and rail, Water and green, Trees, or Terrain.");
      return;
    }
    if (sideM * sideM > MAX_AREA_M2 + 1) {
      setError("That frame is over the 2 km² limit for this version.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
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
      const osmTask = wantsOsm
        ? fetchOverpass(buildOverpassQuery(overpassBBox(bounds), modelLayers), controller.signal)
        : Promise.resolve({ elements: [] });
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
      const [data, terrainResult, comResult, vicmapResult, useTiers] = await Promise.all([
        osmTask,
        terrainTask,
        comTask,
        vicmapTask,
        useTierTask,
      ]);
      const parsed = parseCity(data, center, sideM, modelLayers);
      const buildings = modelLayers.buildings
        ? assignExternalUses(parsed.buildings, useTiers.zones)
        : parsed.buildings;
      const half = sideM / 2;
      const assembled = modelLayers.trees
        ? assembleTreeTiers({
            com: comRecordsToTrees(comResult.rows, center, half),
            osm: parsed.trees,
            vicmap: vicmapPointsToTrees(vicmapResult.points, center, half),
            ...collectTreeContext(data.elements, center, half),
          })
        : null;
      const trees = assembled ? assembled.trees : parsed.trees;
      const contours = Boolean(layers.contours && terrainResult.field);
      let sourceNote = terrainResult.field
        ? parsed.sourceNote.replace(FLAT_GROUND_NOTE, terrainNote(terrainResult.field, contours))
        : parsed.sourceNote;
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
        ...parsed,
        buildings,
        trees,
        treeCapHit: assembled?.capHit ?? false,
        placeLabel,
        sourceNote,
        terrain: terrainResult.field,
        terrainError: terrainResult.error,
        useTierFailures: useTiers.failures,
        contours,
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

  return (
    <div className="app">
      <TopBar
        showNewCut={phase === "model"}
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
          />
          <Sidebar
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
