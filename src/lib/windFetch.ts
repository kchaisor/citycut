import { aggregateHourlyWind, type WindRoseTable } from "./windRose";
import { WIND_CACHE_VERSION, readWindCache, writeWindCache } from "./windCache";

export const OPEN_METEO_WIND_ATTRIBUTION =
  "Weather data by Open-Meteo.com (CC BY 4.0)";

const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

export type WindFetchResult =
  | { ok: true; table: WindRoseTable; fromCache: boolean }
  | { ok: false; quietNote: string };

export function buildWindArchiveUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: "2016-01-01",
    end_date: "2025-12-31",
    hourly: "wind_speed_10m,wind_direction_10m",
    timezone: "Australia/Sydney",
    wind_speed_unit: "kmh",
  });
  return `${ARCHIVE_BASE}?${params.toString()}`;
}

type OpenMeteoHourly = {
  time?: string[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
};

let inflight: Promise<WindFetchResult> | null = null;
let inflightKey = "";

/** One in-flight request per rounded location; no retry on failure. */
export async function fetchWindRoseTable(
  lat: number,
  lon: number,
  storage: Storage = globalThis.localStorage,
  fetchImpl: typeof fetch = fetch,
): Promise<WindFetchResult> {
  const cached = readWindCache(storage, lat, lon);
  if (cached) return { ok: true, table: cached, fromCache: true };

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (inflight && inflightKey === key) return inflight;

  inflightKey = key;
  inflight = (async (): Promise<WindFetchResult> => {
    const url = buildWindArchiveUrl(lat, lon);
    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch {
      return { ok: false, quietNote: "Regional wind data could not be loaded." };
    }
    if (response.status === 401 || response.status === 403 || response.status === 429 || !response.ok) {
      return { ok: false, quietNote: "Regional wind data could not be loaded." };
    }
    let body: { hourly?: OpenMeteoHourly };
    try {
      body = (await response.json()) as { hourly?: OpenMeteoHourly };
    } catch {
      return { ok: false, quietNote: "Regional wind data could not be loaded." };
    }
    const hourly = body.hourly;
    if (!hourly?.time || !hourly.wind_speed_10m || !hourly.wind_direction_10m) {
      return { ok: false, quietNote: "Regional wind data could not be loaded." };
    }
    const table = aggregateHourlyWind(
      lat,
      lon,
      WIND_CACHE_VERSION,
      hourly.time,
      hourly.wind_speed_10m,
      hourly.wind_direction_10m,
    );
    writeWindCache(storage, table);
    return { ok: true, table, fromCache: false };
  })().finally(() => {
    inflight = null;
    inflightKey = "";
  });

  return inflight;
}

/** Test helper: reset module-level in-flight guard. */
export function resetWindFetchInflight(): void {
  inflight = null;
  inflightKey = "";
}
