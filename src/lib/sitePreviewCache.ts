import type { BuildingFeat, LonLat } from "../types";
import { fetchSiteParcelAtPoint, type ParcelFetch, type SiteParcel } from "./vicmapSiteParcel";
import { siteBuildingIdsFromParcel, siteBuildingIdsFromPoint } from "./siteBuildings";
import { toLocal } from "./geo";

type ParcelCacheEntry = {
  key: string;
  parcel: SiteParcel | null;
};

let parcelCache: ParcelCacheEntry | null = null;

function parcelCacheKey(anchor: LonLat, center: LonLat, sideM: number): string {
  return `${anchor.lat.toFixed(6)},${anchor.lon.toFixed(6)}|${center.lat.toFixed(6)},${center.lon.toFixed(6)}|${sideM}`;
}

/** One Vicmap Property hit per anchor/cut; reused by the search map and model build. */
export async function fetchSiteParcelCached(
  anchor: LonLat,
  center: LonLat,
  sideM: number,
  options?: { fetchImpl?: ParcelFetch; signal?: AbortSignal },
): Promise<SiteParcel | null> {
  const key = parcelCacheKey(anchor, center, sideM);
  if (parcelCache?.key === key) return parcelCache.parcel;
  const half = sideM / 2;
  const parcel = await fetchSiteParcelAtPoint(anchor, center, half, options);
  parcelCache = { key, parcel };
  return parcel;
}

export function clearSiteParcelCacheForTests(): void {
  parcelCache = null;
}

export function siteBuildingIdsForPreview(
  buildings: BuildingFeat[],
  anchor: LonLat,
  center: LonLat,
  parcel: SiteParcel | null,
): number[] {
  const anchorLocal = toLocal(anchor.lat, anchor.lon, center);
  if (parcel) return siteBuildingIdsFromParcel(buildings, parcel.polygons);
  return siteBuildingIdsFromPoint(buildings, anchorLocal);
}

