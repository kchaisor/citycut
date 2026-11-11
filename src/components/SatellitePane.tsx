import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../lib/loadMapStyle";
import { getColour } from "../lib/colours";
import { fromLocal, openRing } from "../lib/geo";
import { planViewportFromLngLatBounds, planViewportLngLatBounds } from "../lib/planSatelliteViewport";
import { circleRing, DEFAULT_SITE_FRAME_SHAPE, siteFrameHalf } from "../lib/siteFrame";
import { useColourRevision } from "../lib/useColourRevision";
import type { PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";

const WORLD_OUTER_RING: [number, number][] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

export function SatellitePane({
  model,
  viewport,
  onViewportChange,
}: {
  model: CityModel;
  viewport: PlanViewport;
  onViewportChange: (view: PlanViewport) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const applyingRef = useRef(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const colourTick = useColourRevision();
  const [basemapStyleFailed, setBasemapStyleFailed] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    void loadBasemapStyle("satellite").then(({ style, styleLoadFailed }) => {
      if (cancelled) return;
      if (styleLoadFailed) setBasemapStyleFailed(true);
      map = new maplibregl.Map({
        container,
        style: typeof style === "string" ? undefined : style,
        center: [model.center.lon, model.center.lat],
        zoom: 15,
        attributionControl: false,
        dragRotate: false,
        pitch: 0,
        bearing: 0,
      });
      mapRef.current = map;
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
      const half = siteFrameHalf(model.sideM);
      const localRing =
        frameShape === "circle"
          ? circleRing(half)
          : ([
              [-half, -half],
              [half, -half],
              [half, half],
              [-half, half],
              [-half, -half],
            ] as const);
      const coordinates = openRing(localRing.map(([east, north]) => [east, north] as [number, number])).map(
        ([east, north]) => {
          const { lon, lat } = fromLocal([east, north], model.center);
          return [lon, lat] as [number, number];
        },
      );
      map.on("load", () => {
        if (!map) return;
        map.addSource("cut-mask", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [WORLD_OUTER_RING, [...coordinates].reverse()] },
          },
        });
        map.addLayer({
          id: "cut-mask-fill",
          type: "fill",
          source: "cut-mask",
          paint: { "fill-color": getColour("--viewport-bg"), "fill-opacity": 1 },
        });
        map.addSource("cut", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
        });
        map.addLayer({
          id: "cut-line",
          type: "line",
          source: "cut",
          paint: { "line-color": getColour("--cut-line"), "line-width": 2 },
        });
        applyingRef.current = true;
        map.fitBounds(planViewportLngLatBounds(viewport, model.center), {
          padding: 0,
          duration: 0,
          animate: false,
        });
        applyingRef.current = false;
      });
      map.on("resize", () => {
        if (!map) return;
        applyingRef.current = true;
        map.fitBounds(planViewportLngLatBounds(viewportRef.current, model.center), {
          padding: 0,
          duration: 0,
          animate: false,
        });
        applyingRef.current = false;
      });
      map.on("moveend", (event) => {
        if (applyingRef.current || !map || !event.originalEvent) return;
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        onViewportChange(
          planViewportFromLngLatBounds(
            [
              [sw.lng, sw.lat],
              [ne.lng, ne.lat],
            ],
            model.center,
          ),
        );
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [model.center.lat, model.center.lon, model.sideM, model.frameShape, colourTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyingRef.current = true;
    map.fitBounds(planViewportLngLatBounds(viewport, model.center), {
      padding: 0,
      duration: 0,
      animate: false,
    });
    applyingRef.current = false;
  }, [viewport, model.center]);

  return (
    <div className="map-wrap map-wrap-satellite">
      <div ref={ref} className="map-canvas" />
      {basemapStyleFailed && (
        <p className="map-stage-notice" role="status">
          Basemap style failed to load.
        </p>
      )}
    </div>
  );
}
