import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapAttribution } from "./MapAttribution";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../lib/loadMapStyle";
import { applyFlatNorthUpMapHandlers, FLAT_NORTH_UP_MAP_OPTIONS } from "../lib/mapStageMapOptions";
import {
  demographicsMapLngLatBounds,
  demographicsPlanViewportFromLngLatBounds,
  demographicsPlanViewportLngLatBounds,
} from "../lib/demographicsMapViewport";
import {
  addDemographicsParcelLayers,
  DEMO_PARCELS_FILL,
  DEMO_PARCELS_LINE,
} from "../lib/demographicsMapLayers";
import { trimStyleForDemographicsRoads } from "../lib/demographicsMapStyle";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";

export function DemographicsExplorerBasemap({
  model,
  viewport,
  onViewportChange,
  fitCounter = 0,
}: {
  model: CityModel;
  viewport: PlanViewport;
  onViewportChange: (view: PlanViewport) => void;
  fitCounter?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const applyingRef = useRef(false);
  const viewportRef = useRef(viewport);
  const onViewportChangeRef = useRef(onViewportChange);
  const colourTick = useColourRevision();
  viewportRef.current = viewport;
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;

    void loadBasemapStyle("map").then(({ style, styleLoadFailed }) => {
      if (cancelled) return;
      const bounds = demographicsMapLngLatBounds(model.center, model.sideM);
      map = new maplibregl.Map({
        container,
        style: typeof style === "string" ? undefined : style,
        bounds,
        fitBoundsOptions: { padding: 48, duration: 0, animate: false },
        attributionControl: false,
        ...FLAT_NORTH_UP_MAP_OPTIONS,
      });
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      applyFlatNorthUpMapHandlers(map);
      mapRef.current = map;
      if (typeof window !== "undefined") window.__citycutDemographicsMap = map;

      const syncViewportFromMap = () => {
        if (!map) return;
        const b = map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        onViewportChangeRef.current(
          demographicsPlanViewportFromLngLatBounds(
            [
              [sw.lng, sw.lat],
              [ne.lng, ne.lat],
            ],
            model.center,
          ),
        );
      };

      map.on("load", () => {
        if (!map) return;
        trimStyleForDemographicsRoads(map);
        addDemographicsParcelLayers(map);
        applyingRef.current = true;
        map.fitBounds(bounds, { padding: 48, duration: 0, animate: false });
        applyingRef.current = false;
        syncViewportFromMap();
      });

      map.on("moveend", (event) => {
        if (applyingRef.current || !map) return;
        if (!event.originalEvent) return;
        syncViewportFromMap();
      });

      map.on("resize", () => {
        if (!map) return;
        applyingRef.current = true;
        map.fitBounds(demographicsPlanViewportLngLatBounds(viewportRef.current, model.center), {
          padding: 48,
          duration: 0,
          animate: false,
        });
        applyingRef.current = false;
      });

      if (styleLoadFailed) {
        map.once("styledata", () => {
          trimStyleForDemographicsRoads(map!);
          addDemographicsParcelLayers(map!);
        });
      }
    });

    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && window.__citycutDemographicsMap === map) {
        delete window.__citycutDemographicsMap;
      }
      map?.remove();
      mapRef.current = null;
    };
  }, [colourTick, model.center.lat, model.center.lon, model.sideM]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyingRef.current = true;
    map.fitBounds(demographicsPlanViewportLngLatBounds(viewport, model.center), {
      padding: 48,
      duration: 0,
      animate: false,
    });
    applyingRef.current = false;
  }, [fitCounter, model.center, viewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer(DEMO_PARCELS_FILL)) {
      map.setPaintProperty(DEMO_PARCELS_FILL, "fill-color", getColour("--demographics-parcel-outside"));
      map.setPaintProperty(DEMO_PARCELS_LINE, "line-color", getColour("--demographics-parcel-line"));
    }
  }, [colourTick]);

  return (
    <div className="demographics-explorer-basemap map-wrap">
      <div ref={containerRef} className="map-canvas demographics-maplibre" data-demographics-maplibre="true" />
      <MapAttribution basemap="map" />
    </div>
  );
}
