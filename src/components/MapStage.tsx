import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MAP_STYLE, SATELLITE_STYLE } from "../content/constants";
import { M_PER_DEG_LAT, mPerDegLon, squareBBox } from "../lib/geo";
import { cutFrameLabelKm } from "../lib/placeLabel";
import type { SiteFrameShape } from "../types";
import { updateMapCutColourLayers, removeMapCutColourLayers, updateMapSiteLayers, removeMapSiteLayers } from "../lib/mapSiteLayers";
import { fetchOvertureBaseForCut } from "../lib/overtureBase";
import { fetchOvertureBuildingsForCut } from "../lib/overtureBuildings";
import { fetchSiteParcelCached, siteBuildingIdsForPreview } from "../lib/sitePreviewCache";
import { FLAT_NORTH_UP_MAP_OPTIONS, applyFlatNorthUpMapHandlers } from "../lib/mapStageMapOptions";
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
  const [frame, setFrame] = useState<Frame | null>(null);
  const [ready, setReady] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);
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

    const update = () => {
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

    map.on("load", () => {
      setReady(true);
      update();
    });
    map.on("move", update);
    map.on("moveend", () => setMapEpoch((value) => value + 1));
    map.on("resize", update);

    return () => {
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
    map.once("style.load", () => map.fire("move"));
  }, [basemap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    const center = map.getCenter();
    const cutCenter: LonLat = { lat: center.lat, lon: center.lng };
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const bounds = squareBBox(cutCenter, sideM);
          const [base, buildingResult] = await Promise.all([
            fetchOvertureBaseForCut(bounds, cutCenter, sideM, { waterGreen: true, trees: false, frameShape: frameShapeRef.current }, controller.signal),
            fetchOvertureBuildingsForCut(bounds, cutCenter, sideM, controller.signal, frameShapeRef.current),
          ]);
          if (cancelled || controller.signal.aborted) return;
          if (!map.loaded()) await new Promise<void>((resolve) => map.once("idle", () => resolve()));
          if (cancelled) return;
          updateMapCutColourLayers(map, {
            center: cutCenter,
            sideM,
            frameShape: frameShapeRef.current,
            areas: base.areas,
            buildings: buildingResult.buildings,
          });
        } catch {
          if (!cancelled && map.loaded()) removeMapCutColourLayers(map);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [ready, sideM, mapEpoch, frameShape]);

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

  return (
    <div className={loading ? "map-wrap is-loading" : "map-wrap"}>
      <div ref={containerRef} className="map-canvas" />
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
