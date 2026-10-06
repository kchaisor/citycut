import { fromLocal, openRing } from "./geo";
import { getColour } from "./colours";
import type { BuildingFeat, LonLat } from "../types";
import type { SiteParcel } from "./vicmapSiteParcel";

function ringToLonLat(ring: [number, number][], origin: LonLat): [number, number][] {
  return openRing(ring).map((point) => {
    const { lon, lat } = fromLocal(point, origin);
    return [lon, lat];
  });
}

export function siteBuildingsGeoJson(
  buildings: BuildingFeat[],
  siteBuildingIds: number[],
  center: LonLat,
): GeoJSON.FeatureCollection {
  const idSet = new Set(siteBuildingIds);
  const features: GeoJSON.Feature[] = [];
  for (const building of buildings) {
    if (!idSet.has(building.id)) continue;
    const outer = ringToLonLat(building.ring, center);
    if (outer.length < 3) continue;
    features.push({
      type: "Feature",
      properties: { id: building.id },
      geometry: {
        type: "Polygon",
        coordinates: [outer],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function siteBoundaryGeoJson(parcel: SiteParcel, center: LonLat): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const polygon of parcel.polygons) {
    const outer = ringToLonLat(polygon.outer, center);
    if (outer.length < 3) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [...outer, outer[0]],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function mapSiteLayerPaint() {
  return {
    buildingFill: getColour("--site-building"),
    boundaryColor: getColour("--site-boundary"),
  };
}
