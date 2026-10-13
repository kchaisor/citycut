import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapAttribution } from "./MapAttribution";
import { MgaGridOverlay } from "./MgaGridOverlay";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../lib/loadMapStyle";
import { M_PER_DEG_LAT, mPerDegLon, squareBBox } from "../lib/geo";
import { cutFrameLabelKm } from "../lib/placeLabel";
import type { SiteFrameShape } from "../types";
import { updateMapSiteLayers, removeMapSiteLayers } from "../lib/mapSiteLayers";
import { fetchOvertureBuildingsForCut } from "../lib/overtureBuildings";
import { fetchSiteParcelCached, siteBuildingIdsForPreview } from "../lib/sitePreviewCache";
import { FLAT_NORTH_UP_MAP_OPTIONS, applyFlatNorthUpMapHandlers } from "../lib/mapStageMapOptions";
import { initialLandingZoom } from "../lib/frameFit";
import type { Basemap, LonLat, ViewState } from "../types";

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
  fitFrameOnLoad = false,
  sideM,
  frameShape,
  initialView,
  fly,
  loading,
  siteSearch,
  onCancel,
  onView,
  onFlyLanded,
}: {
  basemap: Basemap;
  /** Fit the whole cut frame into the map when it is first created (phones). */
  fitFrameOnLoad?: boolean;
  sideM: number;
  frameShape: SiteFrameShape;
  initialView: ViewState;
  fly: FlyRequest | null;
  loading: boolean;
  /** Geocoded address to highlight before the model is built. */
  siteSearch: MapSiteSearch | null;
  onCancel: () => void;
  onView: (view: ViewState) => void;
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
  const [frame, setFrame] = useState<Frame | null>(null);
  const [ready, setReady] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [basemapStyleFailed, setBasemapStyleFailed] = useState(false);
  const [sitePreviewFailed, setSitePreviewFailed] = useState(false);
  sideRef.current = sideM;
  frameShapeRef.current = frameShape;
  onViewRef.current = onView;
  onFlyLandedRef.current = onFlyLanded;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    let onLoad: (() => void) | null = null;
    let update: (() => void) | null = null;
    let onMoveEnd: (() => void) | null = null;

    void loadBasemapStyle(appliedBasemap.current).then(({ style, styleLoadFailed }) => {
      if (cancelled) return;
      if (styleLoadFailed) setBasemapStyleFailed(true);
      map = new maplibregl.Map({
        container,
        style: typeof style === "string" ? undefined : style,
        center: [initialView.lon, initialView.lat],
        // On a phone, at load only, zoom out so the whole cut frame fits the map.
        zoom: initialLandingZoom({
          zoom: initialView.zoom,
          sideM: sideRef.current,
          lat: initialView.lat,
          widthPx: container.clientWidth,
          heightPx: container.clientHeight,
          fit: fitFrameOnLoad,
        }),
        attributionControl: false,
        ...FLAT_NORTH_UP_MAP_OPTIONS,
      });
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      applyFlatNorthUpMapHandlers(map);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      update = () => {
        if (!map) return;
        const center = map.getCenter();
        const half = sideRef.current / 2;
        const dLat = half / M_PER_DEG_LAT;
        const dLon = half / mPerDegLon(center.lat);
        const northWest = map.project([center.lng - dLon, center.lat + dLat]);
        const southEast = map.project([center.lng + dLon, center.lat - dLat]);
        const left = Math.min(northWest.x, southEast.x);
        const top = Math.min(northWest.y, southEast.y);
        setFrame({
          left,
          top,
          width: Math.abs(southEast.x - northWest.x),
          height: Math.abs(southEast.y - northWest.y),
        });
        onViewRef.current({ lon: center.lng, lat: center.lat, zoom: map.getZoom() });
      };

      onLoad = () => {
        setReady(true);
        update?.();
      };
      onMoveEnd = () => setMapEpoch((value) => value + 1);

      map.on("load", onLoad);
      map.on("move", update);
      map.on("moveend", onMoveEnd);
      map.on("resize", update);
    });

    return () => {
      cancelled = true;
      const active = map ?? mapRef.current;
      if (active && onLoad && update && onMoveEnd) {
        active.off("load", onLoad);
        active.off("move", update);
        active.off("moveend", onMoveEnd);
        active.off("resize", update);
        removeMapSiteLayers(active);
        active.remove();
      }
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
    void loadBasemapStyle(basemap).then(({ style, styleLoadFailed }) => {
      if (mapRef.current !== map) return;
      if (styleLoadFailed) setBasemapStyleFailed(true);
      else setBasemapStyleFailed(false);
      applyBasemapStyleToMap(map, style);
      map.once("style.load", () => {
        setMapEpoch((value) => value + 1);
      });
    });
  }, [basemap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !siteSearch) {
      const mapOff = mapRef.current;
      if (mapOff?.loaded()) removeMapSiteLayers(mapOff);
      return;
    }
    let cancelled = false;
    setSitePreviewFailed(false);
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
        if (!cancelled && !controller.signal.aborted) setSitePreviewFailed(true);
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
    const frame = window.requestAnimationFrame(() => {
      if (!map.isMoving()) finish();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      map.off("moveend", finish);
    };
  }, [fly, ready]);

  // Floating mock: the landing map runs under the controls on desktop. Pad the camera by the
  // controls' width so the same centre sits in the same place on screen as before.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || typeof map.setPadding !== "function") return;
    const chrome = document.querySelector<HTMLElement>(".select-chrome");
    if (!chrome) return;
    const apply = () => {
      const desktop = window.matchMedia("(min-width: 641px)").matches;
      const inset = parseFloat(getComputedStyle(chrome).paddingLeft) || 0;
      map.setPadding({ left: desktop ? chrome.getBoundingClientRect().width - inset : 0, top: 0, right: 0, bottom: 0 });
    };
    apply();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(chrome);
    return () => observer?.disconnect();
  }, [ready]);

  const sideKm = sideM / 1000;
  const label = cutFrameLabelKm(sideKm, frameShape);
  const circleFrame = frameShape === "circle";

  return (
    <div className={loading ? "map-wrap is-loading" : "map-wrap"}>
      <div ref={containerRef} className={basemap === "satellite" ? "map-canvas" : "map-canvas map-canvas-muted"} />
      {basemap !== "satellite" && <div className="map-tint" aria-hidden="true" />}
      {ready && <MgaGridOverlay map={mapRef.current} />}
      <MapAttribution basemap={basemap} />
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
      {!loading && (basemapStyleFailed || sitePreviewFailed) && (
        <div className="map-stage-notices">
          {basemapStyleFailed && (
            <p className="map-stage-notice" role="status">
              Basemap style failed to load.
            </p>
          )}
          {sitePreviewFailed && (
            <p className="map-stage-notice" role="status">
              Site preview on the map could not be loaded.
            </p>
          )}
        </div>
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
