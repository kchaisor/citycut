import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { mgaGridStep } from "../lib/mgaGrid";
import {
  crossFeatures,
  crossImage,
  crossOpacityExpression,
  crossRegion,
  metresPerPixel,
  MGA_GRID_ICON_ID,
  MGA_GRID_LAYER_ID,
  MGA_GRID_SOURCE_ID,
  regionCovers,
  type GridRegion,
} from "../lib/mgaGridLayer";

function inkRgba(element: HTMLElement): [number, number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = "var(--grid-cross)";
  element.appendChild(probe);
  const match = getComputedStyle(probe).color.match(/[\d.]+/g) ?? [];
  probe.remove();
  const [r = 0, g = 0, b = 0, a = 1] = match.map(Number);
  return [r, g, b, Math.round(a * 255)];
}

/**
 * Map grid on the landing map: thin dark + crosses at MGA easting/northing intersections
 * (GDA2020 / MGA, zone of the view centre; EPSG:7855 in Melbourne), as a native symbol layer.
 * It only reads the camera, never sets it. `epoch` re-adds the layer after a basemap swap.
 */
export function MgaGridLayer({ map, epoch }: { map: maplibregl.Map | null; epoch: number }) {
  useEffect(() => {
    if (
      !map ||
      typeof map.addSource !== "function" ||
      typeof map.addLayer !== "function" ||
      typeof map.addImage !== "function" ||
      typeof map.getSource !== "function" ||
      typeof map.getBounds !== "function" ||
      typeof map.getContainer !== "function"
    )
      return;
    const container = map.getContainer();
    let region: GridRegion | null = null;
    let lat = Number.NaN;
    const ensure = () => {
      if (!map.hasImage?.(MGA_GRID_ICON_ID)) {
        const arm = Number.parseFloat(getComputedStyle(container).getPropertyValue("--grid-cross-arm")) || 6;
        const ratio = window.devicePixelRatio || 1;
        map.addImage(MGA_GRID_ICON_ID, crossImage(arm, inkRgba(container), ratio), { pixelRatio: Math.max(1, Math.round(ratio)) });
      }
      if (!map.getSource(MGA_GRID_SOURCE_ID)) {
        map.addSource(MGA_GRID_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        region = null;
      }
      if (!map.getLayer(MGA_GRID_LAYER_ID)) {
        map.addLayer({
          id: MGA_GRID_LAYER_ID,
          type: "symbol",
          source: MGA_GRID_SOURCE_ID,
          layout: {
            "icon-image": MGA_GRID_ICON_ID,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "viewport",
          },
          paint: { "icon-opacity": 1 },
        });
        lat = Number.NaN;
      }
      return true;
    };
    const update = () => {
      try {
        sync();
      } catch {
        // Style mid-swap: the next styledata/move event retries.
      }
    };
    const sync = () => {
      if (!ensure()) return;
      const b = map.getBounds();
      const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      const centreLat = map.getCenter().lat;
      const step = mgaGridStep(metresPerPixel(map.getZoom(), centreLat));
      container.dataset.gridStep = String(step);
      if (!(Math.abs(centreLat - lat) < 0.25)) {
        lat = centreLat;
        map.setPaintProperty(MGA_GRID_LAYER_ID, "icon-opacity", crossOpacityExpression(lat) as maplibregl.ExpressionSpecification);
      }
      if (regionCovers(region, bounds, step)) return;
      region = crossRegion(bounds, step);
      const data = crossFeatures(region);
      container.dataset.gridCrosses = String(data.features.length);
      (map.getSource(MGA_GRID_SOURCE_ID) as maplibregl.GeoJSONSource).setData(data);
    };
    update();
    map.on("move", update);
    map.on("styledata", update);
    map.on("idle", update);
    return () => {
      map.off("move", update);
      map.off("styledata", update);
      map.off("idle", update);
      try {
        if (map.getLayer?.(MGA_GRID_LAYER_ID)) map.removeLayer(MGA_GRID_LAYER_ID);
        if (map.getSource(MGA_GRID_SOURCE_ID)) map.removeSource(MGA_GRID_SOURCE_ID);
      } catch {
        // Map already torn down.
      }
    };
  }, [map, epoch]);
  return null;
}
