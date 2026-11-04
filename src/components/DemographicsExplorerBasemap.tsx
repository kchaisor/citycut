import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapAttribution } from "./MapAttribution";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../lib/loadMapStyle";
import { applyFlatNorthUpMapHandlers, FLAT_NORTH_UP_MAP_OPTIONS } from "../lib/mapStageMapOptions";
import {
  demographicsMapInitialFitBounds,
  demographicsPlanViewportFromLngLatBounds,
} from "../lib/demographicsMapViewport";
import { addDemographicsParcelLayers, paintDemographicsParcelLayers } from "../lib/demographicsMapLayers";
import { trimStyleForDemographicsRoads } from "../lib/demographicsMapStyle";
import { useColourRevision } from "../lib/useColourRevision";
import type { PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";

let demographicsMapInstanceSeq = 0;

export function DemographicsExplorerBasemap({
  model,
  fitCounter = 0,
  radiusM,
  onOverlayViewport,
}: {
  model: CityModel;
  fitCounter?: number;
  radiusM: number;
  onOverlayViewport: (view: PlanViewport) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const applyingRef = useRef(false);
  const modelRef = useRef(model);
  const radiusRef = useRef(radiusM);
  const onOverlayRef = useRef(onOverlayViewport);
  const styleReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const colourTick = useColourRevision();
  modelRef.current = model;
  radiusRef.current = radiusM;
  onOverlayRef.current = onOverlayViewport;

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
      }

      const syncOverlayViewport = () => {
        const b = map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        onOverlayRef.current(
          demographicsPlanViewportFromLngLatBounds(
            [
              [sw.lng, sw.lat],
              [ne.lng, ne.lat],
            ],
            modelRef.current.center,
          ),
        );
      };

      const scheduleOverlaySync = () => {
        if (rafRef.current != null) return;
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          if (applyingRef.current) return;
          syncOverlayViewport();
        });
      };

      const fitInitial = () => {
        applyingRef.current = true;
        map.fitBounds(
          demographicsMapInitialFitBounds(modelRef.current.center, sideM, radiusRef.current),
          { padding: 56, duration: 0, animate: false },
        );
        applyingRef.current = false;
        syncOverlayViewport();
      };

      const onStyleReady = () => {
        if (styleReadyRef.current) return;
        styleReadyRef.current = true;
        trimStyleForDemographicsRoads(map);
        addDemographicsParcelLayers(map);
        fitInitial();
      };

      map.on("load", onStyleReady);
      if (styleLoadFailed) {
        map.once("styledata", onStyleReady);
      }

      map.on("moveend", (event) => {
        if (applyingRef.current || !event.originalEvent) return;
        scheduleOverlaySync();
      });
    });

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
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
    map.fitBounds(
      demographicsMapInitialFitBounds(model.center, model.sideM, radiusRef.current),
      { padding: 56, duration: 0, animate: false },
    );
    applyingRef.current = false;
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    onOverlayRef.current(
      demographicsPlanViewportFromLngLatBounds(
        [
          [sw.lng, sw.lat],
          [ne.lng, ne.lat],
        ],
        model.center,
      ),
    );
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
