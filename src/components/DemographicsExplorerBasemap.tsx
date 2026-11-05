import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapAttribution } from "./MapAttribution";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../lib/loadMapStyle";
import { applyFlatNorthUpMapHandlers, FLAT_NORTH_UP_MAP_OPTIONS } from "../lib/mapStageMapOptions";
import { demographicsMapInitialFitBounds } from "../lib/demographicsMapViewport";
import {
  addDemographicsParcelLayers,
  paintDemographicsParcelLayers,
} from "../lib/demographicsMapLayers";
import { ensureDemographicsOverlayLayers } from "../lib/demographicsMapOverlays";
import { trimStyleForDemographicsRoads } from "../lib/demographicsMapStyle";
import { useColourRevision } from "../lib/useColourRevision";
import { visibleBoundsFromMap } from "./useDemographicsParcels";
import type { CityModel } from "../types";

let demographicsMapInstanceSeq = 0;

export function DemographicsExplorerBasemap({
  model,
  fitCounter = 0,
  radiusM,
  onMapReady,
  onVisibleBounds,
}: {
  model: CityModel;
  fitCounter?: number;
  radiusM: number;
  onMapReady: (map: maplibregl.Map) => void;
  onVisibleBounds: (bounds: ReturnType<typeof visibleBoundsFromMap>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const applyingRef = useRef(false);
  const modelRef = useRef(model);
  const radiusRef = useRef(radiusM);
  const onMapReadyRef = useRef(onMapReady);
  const onVisibleBoundsRef = useRef(onVisibleBounds);
  const styleReadyRef = useRef(false);
  const boundsTimerRef = useRef<number | null>(null);
  const colourTick = useColourRevision();
  modelRef.current = model;
  radiusRef.current = radiusM;
  onMapReadyRef.current = onMapReady;
  onVisibleBoundsRef.current = onVisibleBounds;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let cancelled = false;
    const instanceId = ++demographicsMapInstanceSeq;

    void loadBasemapStyle("map").then(({ style, styleLoadFailed }) => {
      if (cancelled || mapRef.current) return;
      const center = modelRef.current.center;
      const sideM = modelRef.current.sideM;
      const map = new maplibregl.Map({
        container,
        style: typeof style === "string" ? undefined : style,
        center: [center.lon, center.lat],
        zoom: 14,
        attributionControl: false,
        ...FLAT_NORTH_UP_MAP_OPTIONS,
      });
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      applyFlatNorthUpMapHandlers(map);
      mapRef.current = map;
      (map as maplibregl.Map & { __citycutInstanceId?: number }).__citycutInstanceId = instanceId;
      if (typeof window !== "undefined") {
        window.__citycutDemographicsMap = map;
        window.__citycutDemographicsMapInstanceId = instanceId;
        window.__citycutDemographicsFitBoundsCount = 0;
      }

      const scheduleVisibleBounds = () => {
        if (boundsTimerRef.current != null) window.clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = window.setTimeout(() => {
          boundsTimerRef.current = null;
          if (applyingRef.current) return;
          onVisibleBoundsRef.current(visibleBoundsFromMap(map));
        }, 280);
      };

      const fitInitial = () => {
        applyingRef.current = true;
        if (typeof window !== "undefined") {
          window.__citycutDemographicsFitBoundsCount =
            (window.__citycutDemographicsFitBoundsCount ?? 0) + 1;
        }
        map.fitBounds(
          demographicsMapInitialFitBounds(modelRef.current.center, sideM, radiusRef.current),
          { padding: 56, duration: 0, animate: false },
        );
        applyingRef.current = false;
        onVisibleBoundsRef.current(visibleBoundsFromMap(map));
      };

      const onStyleReady = () => {
        if (styleReadyRef.current) return;
        styleReadyRef.current = true;
        trimStyleForDemographicsRoads(map);
        addDemographicsParcelLayers(map);
        ensureDemographicsOverlayLayers(map);
        fitInitial();
        onMapReadyRef.current(map);
      };

      map.on("load", onStyleReady);
      if (styleLoadFailed) {
        map.once("styledata", onStyleReady);
      }

      map.on("moveend", (event) => {
        if (applyingRef.current || !event.originalEvent) return;
        scheduleVisibleBounds();
      });
    });

    return () => {
      cancelled = true;
      if (boundsTimerRef.current != null) {
        window.clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = null;
      }
      const map = mapRef.current;
      if (map) {
        if (typeof window !== "undefined" && window.__citycutDemographicsMap === map) {
          delete window.__citycutDemographicsMap;
          delete window.__citycutDemographicsMapInstanceId;
        }
        map.remove();
        mapRef.current = null;
        styleReadyRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyingRef.current = true;
    if (typeof window !== "undefined") {
      window.__citycutDemographicsFitBoundsCount =
        (window.__citycutDemographicsFitBoundsCount ?? 0) + 1;
    }
    map.fitBounds(
      demographicsMapInitialFitBounds(model.center, model.sideM, radiusRef.current),
      { padding: 56, duration: 0, animate: false },
    );
    applyingRef.current = false;
    onVisibleBoundsRef.current(visibleBoundsFromMap(map));
  }, [fitCounter, model.center.lat, model.center.lon, model.sideM]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    paintDemographicsParcelLayers(map);
  }, [colourTick]);

  return (
    <div className="demographics-explorer-basemap map-wrap">
      <div ref={containerRef} className="map-canvas demographics-maplibre" data-demographics-maplibre="true" />
      <MapAttribution basemap="map" />
    </div>
  );
}
