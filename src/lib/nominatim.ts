import type { PlaceHit } from "../types";
import {
  coordinateLabel,
  formatLocality,
  labelFromGeocoder,
  type GeocoderAddress,
  type GeocoderRow,
} from "./placeLabel";

type NominatimRow = GeocoderRow & {
  place_id?: number;
  osm_id?: number;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
};

/** Identifies the app. Browsers strip User-Agent and send Referer instead. */
export const NOMINATIM_USER_AGENT = "CityCut/0.1 (https://kchaisor.github.io/citycut/)";

/** Nominatim's usage policy: at most one request per second. */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/** Reverse lookup stays at suburb level. */
export const REVERSE_ZOOM = 14;

const localityCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let nextSlot = 0;

export function localityCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function resetNominatimForTests() {
  localityCache.clear();
  inflight.clear();
  nextSlot = 0;
}

function nominatimBase(): string {
  return (import.meta.env.VITE_NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
}

function nominatimInit(signal?: AbortSignal): RequestInit {
  return {
    headers: {
      Accept: "application/json",
      "User-Agent": NOMINATIM_USER_AGENT,
    },
    referrerPolicy: "strict-origin-when-cross-origin",
    signal,
  };
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/** Reserves the next Nominatim slot so search and reverse share one request per second. */
export function waitForNominatim(signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + NOMINATIM_MIN_INTERVAL_MS;
  const delay = start - now;
  if (delay === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function hitFromRow(row: NominatimRow): PlaceHit | null {
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const display = row.display_name || row.name || "Place";
  let bounds: PlaceHit["bounds"] = null;
  if (row.boundingbox && row.boundingbox.length === 4) {
    const south = Number(row.boundingbox[0]);
    const north = Number(row.boundingbox[1]);
    const west = Number(row.boundingbox[2]);
    const east = Number(row.boundingbox[3]);
    if ([south, north, west, east].every(Number.isFinite)) {
      bounds = [west, south, east, north];
    }
  }
  return {
    id: String(row.place_id ?? row.osm_id ?? `${lat},${lon}`),
    label: labelFromGeocoder(row),
    detail: display,
    lat,
    lon,
    bounds,
  };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const url = new URL(`${nominatimBase()}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  await waitForNominatim(signal);
  const response = await fetch(url, nominatimInit(signal));
  if (!response.ok) throw new Error("Search failed");
  const rows = (await response.json()) as NominatimRow[];
  return rows.flatMap((row) => {
    const hit = hitFromRow(row);
    return hit ? [hit] : [];
  });
}

async function fetchLocality(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  const url = new URL(`${nominatimBase()}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", String(REVERSE_ZOOM));
  url.searchParams.set("addressdetails", "1");
  await waitForNominatim(signal);
  const response = await fetch(url, nominatimInit(signal));
  if (!response.ok) throw new Error("Reverse geocode failed");
  const row = (await response.json()) as { address?: GeocoderAddress };
  return (row.address && formatLocality(row.address)) || coordinateLabel(lat, lon);
}

/**
 * Suburb or locality for a cut centre. Cached by lat/lon rounded to 4 decimals.
 * A failed lookup throws so the caller can show coordinates.
 */
export function reverseLocality(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  const key = localityCacheKey(lat, lon);
  const cached = localityCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = fetchLocality(lat, lon, signal)
    .then((label) => {
      localityCache.set(key, label);
      return label;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
