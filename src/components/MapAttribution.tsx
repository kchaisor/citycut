import { MAP_SATELLITE_ATTRIBUTION, MAP_VECTOR_ATTRIBUTION } from "../lib/mapAttribution";
import type { Basemap } from "../types";

export function MapAttribution({ basemap }: { basemap: Basemap }) {
  if (basemap === "satellite") {
    return (
      <div className="map-attribution" aria-label="Map attribution">
        <a href={MAP_SATELLITE_ATTRIBUTION.esri.href} rel="noopener noreferrer">
          {MAP_SATELLITE_ATTRIBUTION.esri.label}
        </a>
        <span>{MAP_SATELLITE_ATTRIBUTION.contributors}</span>
      </div>
    );
  }
  return (
    <div className="map-attribution" aria-label="Map attribution">
      <a href={MAP_VECTOR_ATTRIBUTION.openFreeMap.href} rel="noopener noreferrer">
        {MAP_VECTOR_ATTRIBUTION.openFreeMap.label}
      </a>
      <span aria-hidden="true"> · </span>
      <a href={MAP_VECTOR_ATTRIBUTION.openMapTiles.href} rel="noopener noreferrer">
        {MAP_VECTOR_ATTRIBUTION.openMapTiles.label}
      </a>
      <span aria-hidden="true"> · </span>
      <a href={MAP_VECTOR_ATTRIBUTION.openStreetMap.href} rel="noopener noreferrer">
        {MAP_VECTOR_ATTRIBUTION.openStreetMap.label}
      </a>
    </div>
  );
}
