import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MAP_STYLE, SATELLITE_STYLE } from "../content/constants";
import { M_PER_DEG_LAT, mPerDegLon, squareBBox } from "../lib/geo";
import { cutFrameLabelKm } from "../lib/placeLabel";
import type { SiteFrameShape } from "../types";
import {
  updateMapCutColourLayers,
  updateMapCutColourMask,
  setMapCutColourData,
  removeMapCutColourLayers,
  ensureLandingColourLayerOrder,
  ensureMapLandingColourShell,
  runWhenMapStyleReady,
  updateMapSiteLayers,
  removeMapSiteLayers,
} from "../lib/mapSiteLayers";
import { landingViewportFootprint } from "../lib/landingMapViewport";
import { readLandingColourCache, writeLandingColourCache } from "../lib/landingMapColourCache";
import { landingLiveColourBuildings } from "../lib/landingColourDelta";
import {
  countBuildingsInCutFrame,
  installLandingColourQaBridge,
  recordColourCoverageProgress,
  sampleLandingDragColourCoverage,
} from "../lib/landingMapColourQa";
import { fetchOvertureBuildingsForCut } from "../lib/overtureBuildings";
import { resolveOvertureReleaseForApp } from "../lib/overtureRelease";
import { isEnrichmentFetchAbort } from "../lib/buildingEnrichmentTiles";
import { mergeBuildingEnrichment } from "../lib/buildingEnrichmentMerge";
import {
  fetchBuildingEnrichmentForCut,
  fetchEnrichmentManifest,
  getEnrichmentPmtilesAbsoluteUrl,
} from "../lib/buildingEnrichmentTiles";
import { cutCenterOutsideBuiltBbox, enrichmentCoverageMessage } from "../lib/enrichmentCoverage";
import { refineBuildingUses } from "../lib/useCascade";
import { fetchSiteParcelCached, siteBuildingIdsForPreview } from "../lib/sitePreviewCache";
import { FLAT_NORTH_UP_MAP_OPTIONS, applyFlatNorthUpMapHandlers } from "../lib/mapStageMapOptions";
import { countLandingUseProvenance } from "../lib/landingUseProvenance";
import { manifestMatchesAppTables } from "../lib/enrichmentTableHashes";
import { shouldRunLiveZoneRefine } from "../lib/landingRefinePolicy";
import { withResolvedUseSourceTiers } from "../lib/useSourceTier";
import type { BuildingEnrichmentRecord } from "../lib/buildingEnrichmentTiles";
import type { Basemap, BuildingFeat, LonLat, ViewState } from "../types";

export type FlyRequest = {
  token: number;
  lon: number;
  lat: number;
  zoom?: number;
  bounds: [number, number, number, number] | null;
};

type Frame = { left: number; top: number; width: number; height: number };

export type MapSiteSearch = LonLat & { label: string };

export function MapStage({
  basemap,
  sideM,
  frameShape,
  initialView,
  fly,
  loading,
  siteSearch,
  onCancel,
  onView,
  onBasemap,
  onFlyLanded,
}: {
  basemap: Basemap;
  sideM: number;
  frameShape: SiteFrameShape;
  initialView: ViewState;
  fly: FlyRequest | null;
  loading: boolean;
  /** Geocoded address to highlight before the model is built. */
  siteSearch: MapSiteSearch | null;
  onCancel: () => void;
  onView: (view: ViewState) => void;
  onBasemap: (basemap: Basemap) => void;
  /** The search or home camera animation has stopped. */
  onFlyLanded: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const sideRef = useRef(sideM);
  const frameShapeRef = useRef(frameShape);
  const onViewRef = useRef(onView);
  const onFlyLandedRef = useRef(onFlyLanded);
  const appliedBasemap = useRef<Basemap>(basemap);
  const mountedFly = useRef(fly?.token ?? null);
  const colourCacheKeyRef = useRef<string | null>(null);
  const enrichmentTilesBrokenRef = useRef(false);
  const frameScreenRef = useRef<Frame | null>(null);
  const landingQaBuildingsRef = useRef<BuildingFeat[] | null>(null);
  const landingQaEnrichmentRef = useRef<Map<string, BuildingEnrichmentRecord> | null>(null);
  const maskRafRef = useRef(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [ready, setReady] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [enrichmentNote, setEnrichmentNote] = useState<string | null>(null);
  const [landingEnrichmentError, setLandingEnrichmentError] = useState<string | null>(null);
  const [landingBuildingCapNote, setLandingBuildingCapNote] = useState<string | null>(null);
  const [landingStacWarning, setLandingStacWarning] = useState<string | null>(null);
  sideRef.current = sideM;
  frameShapeRef.current = frameShape;
  onViewRef.current = onView;
  onFlyLandedRef.current = onFlyLanded;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: basemap === "satellite" ? SATELLITE_STYLE : MAP_STYLE,
      center: [initialView.lon, initialView.lat],
      zoom: initialView.zoom,
      attributionControl: { compact: true },
      ...FLAT_NORTH_UP_MAP_OPTIONS,
    });
    applyFlatNorthUpMapHandlers(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    if (typeof window !== "undefined" && window.location.search.includes("qa=1")) {
      (window as Window & { __citycutMap?: maplibregl.Map }).__citycutMap = map;
    }

    const scheduleMask = () => {
      if (maskRafRef.current) return;
      maskRafRef.current = window.requestAnimationFrame(() => {
        maskRafRef.current = 0;
        const center = map.getCenter();
        updateMapCutColourMask(map, {
          center: { lon: center.lng, lat: center.lat },
          sideM: sideRef.current,
          frameShape: frameShapeRef.current,
        });
      });
    };

    const update = () => {
      const center = map.getCenter();
      const half = sideRef.current / 2;
      const dLat = half / M_PER_DEG_LAT;
      const dLon = half / mPerDegLon(center.lat);
      const northWest = map.project([center.lng - dLon, center.lat + dLat]);
      const southEast = map.project([center.lng + dLon, center.lat - dLat]);
      const left = Math.min(northWest.x, southEast.x);
      const top = Math.min(northWest.y, southEast.y);
      const nextFrame = {
        left,
        top,
        width: Math.abs(southEast.x - northWest.x),
        height: Math.abs(southEast.y - northWest.y),
      };
      setFrame(nextFrame);
      frameScreenRef.current = nextFrame;
      if (typeof window !== "undefined" && window.location.search.includes("qa=1")) {
        const stats = window.__citycutCutColourStats;
        if (stats && stats.frameFirstDrawnMs == null) {
          stats.frameFirstDrawnMs = performance.now();
        }
        if (stats && nextFrame.width > 8) {
          sampleLandingDragColourCoverage(
            map,
            nextFrame,
            stats,
            sideRef.current,
            frameShapeRef.current,
            landingQaBuildingsRef.current,
          );
        }
      }
      scheduleMask();
      onViewRef.current({ lon: center.lng, lat: center.lat, zoom: map.getZoom() });
    };

    const onLoad = () => {
      if (typeof window !== "undefined" && window.location.search.includes("qa=1")) {
        if (!window.__citycutCutColourStats) {
          window.__citycutCutColourStats = {
            maskSetData: 0,
            colourSetData: 0,
            layerRebuilds: 0,
            frameFirstDrawnMs: null,
            colourFillMs: null,
            colourFetchMs: null,
            colourEnrichmentMs: null,
            colourRefineMs: null,
            dragFirstColourMs: null,
            drag95PctColourMs: null,
            dragExpectedInFrame: null,
            navStartMs: performance.now(),
            staticFirstColourMs: null,
            staticFirstAnyColourMs: null,
            static95PctAnyMs: null,
            staticFirstFinalColourMs: null,
            static95PctFinalMs: null,
            panFirstColourMs: null,
            panFirstAnyColourMs: null,
            pan95AnyDuringMs: null,
            panFirstFinalColourMs: null,
            pan95DuringMs: null,
            pan95FinalDuringMs: null,
            pan95AfterReleaseMs: null,
            pan95FinalAfterReleaseMs: null,
            panStartMs: null,
          };
        }
      }
      setReady(true);
      update();
    };
    const flushMask = () => {
      if (maskRafRef.current) {
        window.cancelAnimationFrame(maskRafRef.current);
        maskRafRef.current = 0;
      }
      const center = map.getCenter();
      updateMapCutColourMask(map, {
        center: { lon: center.lng, lat: center.lat },
        sideM: sideRef.current,
        frameShape: frameShapeRef.current,
      });
      ensureLandingColourLayerOrder(map);
    };

    const onMoveEnd = () => {
      flushMask();
      setMapEpoch((value) => value + 1);
    };
    const onMoveStart = () => {
      if (typeof window !== "undefined" && window.location.search.includes("qa=1")) {
        const stats = window.__citycutCutColourStats;
        if (stats) {
          stats.panStartMs = performance.now();
          stats.panFirstColourMs = null;
          stats.pan95DuringMs = null;
          stats.pan95AfterReleaseMs = null;
          stats.panFirstAnyColourMs = null;
          stats.pan95AnyDuringMs = null;
          stats.panFirstFinalColourMs = null;
          stats.pan95FinalDuringMs = null;
          stats.pan95FinalAfterReleaseMs = null;
        }
      }
    };

    map.on("load", onLoad);
    map.on("movestart", onMoveStart);
    map.on("move", update);
    map.on("moveend", onMoveEnd);
    map.on("resize", update);

    return () => {
      if (maskRafRef.current) window.cancelAnimationFrame(maskRafRef.current);
      map.off("load", onLoad);
      map.off("movestart", onMoveStart);
      map.off("move", update);
      map.off("moveend", onMoveEnd);
      map.off("resize", update);
      removeMapCutColourLayers(map);
      removeMapSiteLayers(map);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The map is created once per mount. Later camera changes go through flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sideRef.current = sideM;
    frameShapeRef.current = frameShape;
    const map = mapRef.current;
    if (!map || !ready) return;
    map.fire("move");
  }, [sideM, frameShape, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (appliedBasemap.current === basemap) return;
    appliedBasemap.current = basemap;
    map.setStyle(basemap === "satellite" ? SATELLITE_STYLE : MAP_STYLE);
    map.once("style.load", () => {
      colourCacheKeyRef.current = null;
      setMapEpoch((value) => value + 1);
    });
  }, [basemap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || basemap !== "map") {
      colourCacheKeyRef.current = null;
      enrichmentTilesBrokenRef.current = false;
      const mapOff = mapRef.current;
      if (mapOff?.loaded()) removeMapCutColourLayers(mapOff);
      return;
    }

    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const shellOptions = () => {
      const center = map.getCenter();
      return {
        maskCenter: { lat: center.lat, lon: center.lng },
        cutSideM: sideRef.current,
        frameShape: frameShapeRef.current,
      };
    };
    const applyShell = (enrichmentAbsoluteUrl: string | null) => {
      cleanups.push(
        runWhenMapStyleReady(
          map,
          () => {
            ensureMapLandingColourShell(map, {
              ...shellOptions(),
              enrichmentAbsoluteUrl,
            });
          },
          () => cancelled,
        ),
      );
    };

    const startInstall = () => {
      applyShell(null);
      if (!enrichmentTilesBrokenRef.current) {
        void getEnrichmentPmtilesAbsoluteUrl()
          .then((url) => {
            if (!cancelled) applyShell(url);
          })
          .catch(() => {
            enrichmentTilesBrokenRef.current = true;
          });
      }
    };

    if (map.isStyleLoaded()) startInstall();
    else map.once("load", startInstall);

    return () => {
      cancelled = true;
      for (const off of cleanups) off();
    };
  }, [ready, basemap, mapEpoch, sideM, frameShape]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || basemap !== "map") return;
    installLandingColourQaBridge(map, {
      sideM: sideRef.current,
      frameShape: frameShapeRef.current,
      getBuildings: () => landingQaBuildingsRef.current,
      getEnrichmentById: () => landingQaEnrichmentRef.current,
    });
  }, [ready, basemap, sideM, frameShape, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || basemap !== "map") {
      return;
    }
    const bounds = map.getBounds();
    const footprint = landingViewportFootprint(
      { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() },
      map.getZoom(),
    );
    const searchParams =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const tilesOnly = searchParams.has("tilesOnly");
    const forceLiveRefine = searchParams.has("forceLiveRefine");
    const qaFetch = searchParams.get("qa") === "1";
    const colourCacheKey = `${footprint.cacheKey}|${tilesOnly ? "tilesOnly" : "liveRefine"}`;
    if (colourCacheKey === colourCacheKeyRef.current) return;

    let cancelled = false;
    const controller = new AbortController();
    const maskCenter: LonLat = { lat: map.getCenter().lat, lon: map.getCenter().lng };
    const tilesMode = () => !enrichmentTilesBrokenRef.current;

    const applyPayload = (
      buildings: BuildingFeat[],
      dataOrigin: LonLat,
      enrichmentById: Map<string, BuildingEnrichmentRecord> | null,
    ) => {
      if (cancelled) return;
      const cutSideM = sideRef.current;
      if (typeof window !== "undefined" && window.location.search.includes("qa=1")) {
        const stats = window.__citycutCutColourStats;
        if (stats) {
          stats.dragExpectedInFrame = countBuildingsInCutFrame(
            buildings,
            cutSideM,
            frameShapeRef.current,
          );
        }
      }

      if (!tilesMode()) {
        updateMapCutColourLayers(map, {
          dataOrigin,
          dataSideM: footprint.sideM,
          maskCenter,
          cutSideM,
          frameShape: frameShapeRef.current,
          buildings,
        });
      } else {
        const overlay =
          enrichmentById != null ? landingLiveColourBuildings(buildings, enrichmentById) : buildings;
        if (!setMapCutColourData(map, { dataOrigin, sideM: footprint.sideM, buildings: overlay })) {
          void getEnrichmentPmtilesAbsoluteUrl().then((url) => {
            if (cancelled) return;
            ensureMapLandingColourShell(map, {
              enrichmentAbsoluteUrl: url,
              maskCenter,
              cutSideM,
              frameShape: frameShapeRef.current,
            });
            setMapCutColourData(map, { dataOrigin, sideM: footprint.sideM, buildings: overlay });
          });
        }
        updateMapCutColourMask(map, { center: maskCenter, sideM: cutSideM, frameShape: frameShapeRef.current });
      }
      colourCacheKeyRef.current = colourCacheKey;
      landingQaBuildingsRef.current = buildings;
      if (enrichmentById) landingQaEnrichmentRef.current = enrichmentById;
      map.once("idle", () => {
        const stats = window.__citycutCutColourStats;
        if (!stats) return;
        recordColourCoverageProgress(map, stats, cutSideM, frameShapeRef.current, {
          panning: map.isMoving(),
          buildings: landingQaBuildingsRef.current,
        });
        if (!map.isMoving()) {
          recordColourCoverageProgress(map, stats, cutSideM, frameShapeRef.current, {
            panning: false,
            buildings: landingQaBuildingsRef.current,
          });
        }
      });
    };

    const refreshEnrichmentOverlay = async (
      buildings: BuildingFeat[],
      dataOrigin: LonLat,
    ): Promise<void> => {
      try {
        const enrichment = await fetchBuildingEnrichmentForCut(footprint.bounds, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        if (enrichment.error) {
          enrichmentTilesBrokenRef.current = true;
          setLandingEnrichmentError(enrichment.error);
          applyPayload(buildings, dataOrigin, null);
          return;
        }
        setLandingEnrichmentError(null);
        applyPayload(buildings, dataOrigin, enrichment.byId);
      } catch (err) {
        if (cancelled || controller.signal.aborted || isEnrichmentFetchAbort(err, controller.signal)) {
          return;
        }
        enrichmentTilesBrokenRef.current = true;
        setLandingEnrichmentError(
          err instanceof Error ? err.message : "Building enrichment tiles could not be loaded.",
        );
      }
    };

    const runFetch = async () => {
      setLandingBuildingCapNote(null);
      setLandingStacWarning(null);
      const fetchT0 = qaFetch ? performance.now() : 0;
      try {
        const manifest = await fetchEnrichmentManifest(controller.signal);
        const { release: appOvertureRelease, stacWarning: overtureStacWarning } =
          await resolveOvertureReleaseForApp(manifest, controller.signal);
        const buildingResult = await fetchOvertureBuildingsForCut(
          footprint.bounds,
          footprint.origin,
          footprint.sideM,
          controller.signal,
          "square",
          { overtureRelease: appOvertureRelease, stacWarning: overtureStacWarning },
        );
        const enrichT0 = qaFetch ? performance.now() : 0;
        let enrichment: Awaited<ReturnType<typeof fetchBuildingEnrichmentForCut>>;
        try {
          enrichment = await fetchBuildingEnrichmentForCut(footprint.bounds, controller.signal);
        } catch (err) {
          if (isEnrichmentFetchAbort(err, controller.signal) || cancelled) return;
          throw err;
        }
        if (enrichment.error) {
          enrichmentTilesBrokenRef.current = true;
          setLandingEnrichmentError(enrichment.error);
        } else {
          setLandingEnrichmentError(null);
        }
        const enrichT1 = qaFetch ? performance.now() : 0;
        const mergedRaw = mergeBuildingEnrichment(buildingResult.buildings, enrichment.byId);
        const merged = withResolvedUseSourceTiers(mergedRaw);
        const tablesMatch = await manifestMatchesAppTables(manifest);
        let buildingsForCut = merged;
        let refineRan = false;
        if (
          shouldRunLiveZoneRefine({
            tilesOnly,
            forceLiveRefine,
            enrichmentError: enrichment.error,
            manifestMatchesAppTables: tablesMatch,
            manifest,
            appOvertureRelease,
            cutBounds: footprint.bounds,
            merged: mergedRaw,
            byId: enrichment.byId,
          })
        ) {
          refineRan = true;
          const refined = await refineBuildingUses(merged, footprint.origin, footprint.bounds, {
            signal: controller.signal,
          });
          buildingsForCut = withResolvedUseSourceTiers(refined.buildings);
        }
        const prov = countLandingUseProvenance(mergedRaw, buildingsForCut);
        const fetchT1 = qaFetch ? performance.now() : 0;
        if (qaFetch && window.__citycutCutColourStats) {
          window.__citycutCutColourStats.colourFetchMs = Math.round(fetchT1 - fetchT0);
          window.__citycutCutColourStats.colourEnrichmentMs = Math.round(enrichT1 - enrichT0);
          window.__citycutCutColourStats.colourRefineMs = refineRan ? Math.round(fetchT1 - enrichT1) : 0;
          window.__citycutCutColourStats.landingUseFromTiles = prov.tileTierAfterMerge;
          window.__citycutCutColourStats.landingUseFromLiveRefine = prov.liveRefineNewlyClassified;
          window.__citycutCutColourStats.landingUseUnclassified = prov.unclassifiedFinal;
          window.__citycutCutColourStats.landingUseTotal = prov.total;
          window.__citycutCutColourStats.landingBuildingCapHit = buildingResult.buildingCapHit;
          window.__citycutCutColourStats.landingOvertureFragmentCount = buildingResult.stats.fragmentCount;
          window.__citycutCutColourStats.tilesOnlyMode = tilesOnly;
          window.__citycutCutColourStats.landingUseTierCounts = prov.finalTierCounts;
        }
        if (cancelled || controller.signal.aborted) return;
        if (!map.loaded()) await new Promise<void>((resolve) => map.once("idle", () => resolve()));
        if (cancelled) return;
        if (!cancelled) {
          setLandingStacWarning(buildingResult.stacWarning);
          setLandingBuildingCapNote(
            buildingResult.buildingCapHit
              ? `Showing the largest 4,000 of ${buildingResult.stats.fragmentCount.toLocaleString()} building parts in this view.`
              : null,
          );
        }
        if (!qaFetch) {
          writeLandingColourCache(colourCacheKey, {
            buildings: buildingsForCut,
            dataOrigin: footprint.origin,
          });
        }
        applyPayload(
          buildingsForCut,
          footprint.origin,
          enrichment.error ? null : enrichment.byId,
        );
      } catch (err) {
        if (cancelled || controller.signal.aborted || isEnrichmentFetchAbort(err, controller.signal)) {
          return;
        }
        enrichmentTilesBrokenRef.current = true;
        const message =
          err instanceof Error ? err.message : "Building enrichment tiles could not be loaded.";
        setLandingEnrichmentError(message);
        if (map.loaded()) removeMapCutColourLayers(map);
      }
    };

    const cached = qaFetch ? undefined : readLandingColourCache(colourCacheKey);
    if (cached) {
      if (tilesMode()) {
        applyPayload(cached.buildings, cached.dataOrigin, landingQaEnrichmentRef.current);
        void refreshEnrichmentOverlay(cached.buildings, cached.dataOrigin);
      } else {
        applyPayload(cached.buildings, cached.dataOrigin, null);
      }
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const timer = window.setTimeout(() => {
      void runFetch();
    }, 280);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [ready, basemap, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !siteSearch) {
      const mapOff = mapRef.current;
      if (mapOff?.loaded()) removeMapSiteLayers(mapOff);
      return;
    }
    let cancelled = false;
    const center = map.getCenter();
    const cutCenter: LonLat = { lat: center.lat, lon: center.lng };
    const controller = new AbortController();

    void (async () => {
      try {
        const bounds = squareBBox(cutCenter, sideM);
        const [buildingResult, parcel] = await Promise.all([
          fetchOvertureBuildingsForCut(bounds, cutCenter, sideM, controller.signal),
          fetchSiteParcelCached(siteSearch, cutCenter, sideM, { signal: controller.signal }),
        ]);
        if (cancelled || controller.signal.aborted) return;
        const siteBuildingIds = siteBuildingIdsForPreview(
          buildingResult.buildings,
          siteSearch,
          cutCenter,
          parcel,
        );
        if (!map.loaded()) await new Promise<void>((resolve) => map.once("idle", () => resolve()));
        if (cancelled) return;
        updateMapSiteLayers(map, {
          center: cutCenter,
          buildings: buildingResult.buildings,
          siteBuildingIds,
          parcel,
        });
      } catch {
        /* Fail quietly when Vicmap or Overture errors. */
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (map.loaded()) removeMapSiteLayers(map);
    };
  }, [ready, sideM, mapEpoch, siteSearch?.lat, siteSearch?.lon, siteSearch?.label]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly || !ready) return;
    if (fly.token === mountedFly.current) return;
    mountedFly.current = fly.token;
    let landed = false;
    const finish = () => {
      if (landed) return;
      landed = true;
      map.off("moveend", finish);
      onFlyLandedRef.current();
    };
    map.on("moveend", finish);
    if (fly.bounds) {
      map.fitBounds(
        [
          [fly.bounds[0], fly.bounds[1]],
          [fly.bounds[2], fly.bounds[3]],
        ],
        { padding: 56, maxZoom: 16, duration: 1100, pitch: 0, bearing: 0 },
      );
    } else {
      map.flyTo({
        center: [fly.lon, fly.lat],
        zoom: fly.zoom ?? Math.max(map.getZoom(), 15),
        duration: 1100,
        pitch: 0,
        bearing: 0,
      });
    }
    // fitBounds starts on the next frame. If it never moves, land anyway so a later
    // pan is not stuck on the searched point.
    const frame = window.requestAnimationFrame(() => {
      if (!map.isMoving()) finish();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      map.off("moveend", finish);
    };
  }, [fly, ready]);

  const sideKm = sideM / 1000;
  const label = cutFrameLabelKm(sideKm, frameShape);
  const circleFrame = frameShape === "circle";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const manifest = await fetchEnrichmentManifest();
      if (cancelled) return;
      const map = mapRef.current;
      const center = map?.getCenter();
      if (!center || !cutCenterOutsideBuiltBbox({ lat: center.lat, lon: center.lng }, manifest)) {
        setEnrichmentNote(null);
        return;
      }
      setEnrichmentNote(enrichmentCoverageMessage(manifest));
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const refresh = () => {
      void (async () => {
        const manifest = await fetchEnrichmentManifest();
        const center = map.getCenter();
        if (!cutCenterOutsideBuiltBbox({ lat: center.lat, lon: center.lng }, manifest)) {
          setEnrichmentNote(null);
          return;
        }
        setEnrichmentNote(enrichmentCoverageMessage(manifest));
      })();
    };
    map.on("moveend", refresh);
    refresh();
    return () => {
      map.off("moveend", refresh);
    };
  }, [ready]);

  return (
    <div className={loading ? "map-wrap is-loading" : "map-wrap"}>
      <div ref={containerRef} className="map-canvas" />
      {(enrichmentNote ||
        landingEnrichmentError ||
        landingBuildingCapNote ||
        landingStacWarning) && (
        <p className="enrichment-coverage-banner" role="status">
          {landingEnrichmentError
            ? `Building enrichment tiles could not be loaded (${landingEnrichmentError}). Use colours may be incomplete.`
            : [landingStacWarning, enrichmentNote, landingBuildingCapNote].filter(Boolean).join(" ")}
        </p>
      )}
      <div className="basemap" role="group" aria-label="Basemap">
        <button
          type="button"
          className={basemap === "map" ? "active" : ""}
          onClick={() => onBasemap("map")}
        >
          Map
        </button>
        <button
          type="button"
          className={basemap === "satellite" ? "active" : ""}
          onClick={() => onBasemap("satellite")}
        >
          Satellite
        </button>
      </div>
      {frame && frame.width > 8 && (
        <>
          <div
            className={circleFrame ? "frame frame-circle" : "frame"}
            style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          />
          <div
            className="frame-label"
            style={{
              left: Math.min(
                Math.max(frame.left + frame.width / 2, 88),
                (containerRef.current?.clientWidth ?? 800) - 150,
              ),
              top: Math.max(frame.top, 16),
            }}
          >
            {label}
          </div>
        </>
      )}
      {loading && <div className="loading-shield" />}
      {loading && (
        <div className="loading-card" role="status">
          <strong>Cutting this block</strong>
          <p>
            Fetching buildings, roads, terrain and open space from Overture Maps, Vicmap and Mapterhorn. This often
            takes a few seconds, sometimes longer.
          </p>
          <div className="bar" aria-hidden="true">
            <span />
          </div>
          <button className="text-btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
