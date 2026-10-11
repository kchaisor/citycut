import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapAttribution } from "./MapAttribution";
import { loadBasemapStyle } from "../lib/loadMapStyle";
import { getColour } from "../lib/colours";
import { squareBBox } from "../lib/geo";
import { useColourRevision } from "../lib/useColourRevision";
import type { CityModel } from "../types";

export function SatellitePane({ model }: { model: CityModel }) {
  const ref = useRef<HTMLDivElement>(null);
  const colourTick = useColourRevision();

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    const bounds = squareBBox(model.center, model.sideM);
    void loadBasemapStyle("satellite").then((style) => {
      if (cancelled) return;
      map = new maplibregl.Map({
        container,
        style,
        center: [model.center.lon, model.center.lat],
        zoom: 15,
        attributionControl: false,
        dragRotate: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const ring: [number, number][] = [
        [bounds.west, bounds.south],
        [bounds.east, bounds.south],
        [bounds.east, bounds.north],
        [bounds.west, bounds.north],
        [bounds.west, bounds.south],
      ];
      map.on("load", () => {
        if (!map) return;
        map.addSource("cut", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } },
        });
        map.addLayer({
          id: "cut-line",
          type: "line",
          source: "cut",
          paint: { "line-color": getColour("--cut-line"), "line-width": 2 },
        });
        map.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          { padding: 28, duration: 0, animate: false },
        );
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [model, colourTick]);

  return (
    <div className="map-wrap map-wrap-satellite">
      <div ref={ref} className="map-canvas" />
      <MapAttribution basemap="satellite" />
    </div>
  );
}
