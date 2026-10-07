import { fromLocal, openRing } from "./geo";
import { landingBuildingFill } from "./landingBuildingFill";
import { interiorPoint } from "./useCascade";
import { pointInSiteFrame } from "./siteFrame";
import type { AreaFeat, BuildingFeat, LonLat, SiteFrameShape } from "../types";

function ringToLonLat(ring: [number, number][], origin: LonLat): [number, number][] {
  return openRing(ring).map((point) => {
    const { lon, lat } = fromLocal(point, origin);
    return [lon, lat];
  });
}

export function cutAreasGeoJson(
  areas: AreaFeat[],
  center: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const area of areas) {
    const anchor = interiorPoint(area.ring, area.holes);
    if (!pointInSiteFrame(anchor, sideM, frameShape)) continue;
    const outer = ringToLonLat(area.ring, center);
    if (outer.length < 3) continue;
    features.push({
      type: "Feature",
      properties: { kind: area.kind },
      geometry: { type: "Polygon", coordinates: [outer] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function cutBuildingsGeoJson(
  buildings: BuildingFeat[],
  center: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const building of buildings) {
    const anchor = interiorPoint(building.ring, building.holes);
    if (!pointInSiteFrame(anchor, sideM, frameShape)) continue;
    const outer = ringToLonLat(building.ring, center);
    if (outer.length < 3) continue;
    const fill = landingBuildingFill(building);
    features.push({
      type: "Feature",
      properties: { fill },
      geometry: { type: "Polygon", coordinates: [outer] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function cutFrameGeoJson(center: LonLat, sideM: number, shape: SiteFrameShape): GeoJSON.Feature {
  const half = sideM / 2;
  const ring: [number, number][] =
    shape === "circle"
      ? Array.from({ length: 64 }, (_, index) => {
          const angle = (index / 64) * Math.PI * 2;
          const east = Math.cos(angle) * half;
          const north = Math.sin(angle) * half;
          const { lon, lat } = fromLocal([east, north], center);
          return [lon, lat];
        })
      : [
          fromLocal([-half, -half], center),
          fromLocal([half, -half], center),
          fromLocal([half, half], center),
          fromLocal([-half, half], center),
          fromLocal([-half, -half], center),
        ].map(({ lon, lat }) => [lon, lat]);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}
