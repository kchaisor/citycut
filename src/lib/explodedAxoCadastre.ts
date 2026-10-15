import { squareBBox } from "./geo";
import { clipAreaToSiteFrame, DEFAULT_SITE_FRAME_SHAPE } from "./siteFrame";
import { fetchTierJson } from "./useCascade";
import { polygonsFromGeometry, VICMAP_PROPERTY_URL } from "./vicmapSiteParcel";
import type { CityModel, Pt } from "../types";

/** Vicmap_Parcel/FeatureServer/0 maxRecordCount. */
export const AXO_CADASTRE_PAGE_SIZE = 2000;
/** Hard stop so a huge frame cannot page forever; hitting it marks the plate partial. */
export const AXO_CADASTRE_MAX_PAGES = 15;
export const AXO_CADASTRE_TIMEOUT_MS = 20_000;

export type CadastreOverlay = {
  /** Parcel outlines (outer + holes) clipped to the frame, local east/north metres. */
  parcels: Pt[][][];
  /** Raw features before strata de-duplication. */
  rawCount: number;
  /** True when the page cap stopped the fetch early. */
  partial: boolean;
};

export type CadastreFetchResult = { ok: true; data: CadastreOverlay } | { ok: false; message: string };

export const AXO_CADASTRE_UNAVAILABLE_NOTE = "Cadastre unavailable: Vicmap Parcel did not load";

export function cadastreQueryUrl(model: CityModel, offset: number): string {
  const b = squareBBox(model.center, model.sideM);
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${b.west},${b.south},${b.east},${b.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "parcel_pfi,parcel_road",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "OBJECTID",
    resultOffset: String(offset),
    resultRecordCount: String(AXO_CADASTRE_PAGE_SIZE),
    f: "geojson",
  });
  return `${VICMAP_PROPERTY_URL}/query?${params.toString()}`;
}

/** Geometry key at 10 cm: stacked strata lots share one footprint and collapse to one outline. */
export function parcelGeometryKey(outer: Pt[]): string {
  const pts = outer.map(([e, n]) => `${Math.round(e * 10)},${Math.round(n * 10)}`);
  if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
  // Rotation/direction independent: sort the vertex set.
  return [...pts].sort().join(";");
}

type GeoJsonPage = {
  features?: { geometry?: unknown; properties?: Record<string, unknown> | null }[];
  properties?: { exceededTransferLimit?: boolean };
  exceededTransferLimit?: boolean;
  error?: unknown;
};

/** Parses pages already fetched; exported for tests. */
export function cadastreFromPages(model: CityModel, pages: GeoJsonPage[], partial: boolean): CadastreOverlay {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const seen = new Set<string>();
  const parcels: Pt[][][] = [];
  let rawCount = 0;
  for (const page of pages) {
    for (const feature of page.features ?? []) {
      rawCount += 1;
      for (const poly of polygonsFromGeometry(feature.geometry as never, model.center)) {
        const key = parcelGeometryKey(poly.outer as Pt[]);
        if (seen.has(key)) continue;
        seen.add(key);
        const clipped = clipAreaToSiteFrame(poly.outer as Pt[], poly.holes as Pt[][], model.sideM, shape);
        if (clipped) parcels.push(clipped);
      }
    }
  }
  return { parcels, rawCount, partial };
}

/** Paged Vicmap Parcel fetch (2,000 per page) for the frame. Any failed page fails the plate visibly. */
export async function fetchCadastreOverlay(
  model: CityModel,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<CadastreFetchResult> {
  const pages: GeoJsonPage[] = [];
  for (let page = 0; page < AXO_CADASTRE_MAX_PAGES; page += 1) {
    const res = await fetchTierJson(cadastreQueryUrl(model, page * AXO_CADASTRE_PAGE_SIZE), {
      signal,
      timeoutMs: AXO_CADASTRE_TIMEOUT_MS,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    if (!res.ok) return { ok: false, message: AXO_CADASTRE_UNAVAILABLE_NOTE };
    const body = res.body as GeoJsonPage;
    if (!body || body.error || !Array.isArray(body.features)) return { ok: false, message: AXO_CADASTRE_UNAVAILABLE_NOTE };
    pages.push(body);
    const more = body.properties?.exceededTransferLimit ?? body.exceededTransferLimit ?? false;
    if (!more) return { ok: true, data: cadastreFromPages(model, pages, false) };
  }
  return { ok: true, data: cadastreFromPages(model, pages, true) };
}

export function axoCadastreNote(data: CadastreOverlay): string {
  const base = `Cadastre: Vicmap Parcel, ${data.parcels.length} parcels (${data.rawCount} records, strata de-duplicated)`;
  return data.partial ? `${base}. Partial: page limit reached` : base;
}
