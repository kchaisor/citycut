import type { PlaceAnchor } from "./placeLabel";
import { toLocal } from "./geo";
import { siteBuildingIdsFromParcel, siteBuildingIdsFromPoint } from "./siteBuildings";
import { fetchSiteParcelCached } from "./sitePreviewCache";
import {
  fetchSiteParcelAtPoint,
  VICMAP_PROPERTY_ATTRIBUTION,
  type SiteParcel,
} from "./vicmapSiteParcel";
import type { BuildingFeat, LonLat } from "../types";

export type SiteFrame = {
  /** Geocoded address search point. */
  anchor: LonLat;
  parcel: SiteParcel | null;
  siteBuildingIds: number[];
  /** Quiet note when Vicmap fails or the point is outside Victoria. */
  note: string | null;
};

export type SiteResolveInput = {
  anchor: LonLat;
  center: LonLat;
  sideM: number;
  buildings: BuildingFeat[];
  signal?: AbortSignal;
  fetchImpl?: import("./vicmapSiteParcel").ParcelFetch;
};

/** True when the URL label looks like a searched street address (shared links). */
export function labelLooksLikeAddress(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed || trimmed === "Selected frame") return false;
  return /^\d/.test(trimmed) && trimmed.includes(",");
}

export function shouldResolveSite(anchor: PlaceAnchor | null, siteFromUrl: LonLat | null): boolean {
  if (siteFromUrl) return true;
  if (!anchor) return false;
  return labelLooksLikeAddress(anchor.label);
}

export async function resolveSiteFrame(input: SiteResolveInput): Promise<SiteFrame> {
  const half = input.sideM / 2;
  const parcel = input.fetchImpl
    ? await fetchSiteParcelAtPoint(input.anchor, input.center, half, {
        signal: input.signal,
        fetchImpl: input.fetchImpl,
      })
    : await fetchSiteParcelCached(input.anchor, input.center, input.sideM, {
        signal: input.signal,
      });
  let siteBuildingIds: number[] = [];
  let note: string | null = null;
  const anchorLocal = toLocal(input.anchor.lat, input.anchor.lon, input.center);
  if (parcel) {
    siteBuildingIds = siteBuildingIdsFromParcel(input.buildings, parcel.polygons);
  } else {
    note = "Property boundary unavailable for this address.";
    siteBuildingIds = siteBuildingIdsFromPoint(input.buildings, anchorLocal);
  }
  return {
    anchor: input.anchor,
    parcel,
    siteBuildingIds,
    note: parcel ? null : note,
  };
}

export function siteAttributionNote(site: SiteFrame | null): string | null {
  if (!site?.parcel) return null;
  return VICMAP_PROPERTY_ATTRIBUTION;
}
