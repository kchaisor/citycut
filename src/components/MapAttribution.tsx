import { MAP_SATELLITE_ATTRIBUTION, MAP_VECTOR_ATTRIBUTION } from "../lib/mapAttribution";
import type { Basemap } from "../types";

const linkProps = { target: "_blank" as const, rel: "noopener noreferrer" };

export function MapAttribution({ basemap }: { basemap: Basemap }) {
  if (basemap === "satellite") {
    return (
      <div className="map-attribution" aria-label="Map attribution">
        <a href={MAP_SATELLITE_ATTRIBUTION.esri.href} {...linkProps}>
          {MAP_SATELLITE_ATTRIBUTION.esri.label}
        </a>
        <span aria-hidden="true"> · </span>
        <span>{MAP_SATELLITE_ATTRIBUTION.contributors}</span>
      </div>
    );
  }
  return (
    <div className="map-attribution" aria-label="Map attribution">
      <a href={MAP_VECTOR_ATTRIBUTION.openFreeMap.href} {...linkProps}>
        {MAP_VECTOR_ATTRIBUTION.openFreeMap.label}
      </a>
      <span aria-hidden="true"> · </span>
      <a href={MAP_VECTOR_ATTRIBUTION.openMapTiles.href} {...linkProps}>
        {MAP_VECTOR_ATTRIBUTION.openMapTiles.label}
      </a>
      <span aria-hidden="true"> · </span>
      <a href={MAP_VECTOR_ATTRIBUTION.openStreetMap.href} {...linkProps}>
        {MAP_VECTOR_ATTRIBUTION.openStreetMap.label}
      </a>
    </div>
  );
}
