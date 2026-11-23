import type {
  SiteWindSelection,
  WindRoseAsset,
  WindRoseIndex,
  WindRoseStationIndexRecord,
  WindRoseStationRecord,
} from "./windRoseData";
import {
  WIND_ROSE_SOURCE,
  WIND_ROSE_SUPPORTED_ASSET_VERSIONS,
  WIND_SPEED_BIN_EDGES_MS,
  windStationFilePath,
} from "./windRoseData";
import { siteWindSelection } from "./windStation";

const WIND_INDEX_URL = `${import.meta.env.BASE_URL}wind/australia-tmyx.json?v=3`;

let indexPromise: Promise<WindRoseIndex | WindRoseAsset | null> | null = null;
let cachedIndex: WindRoseIndex | WindRoseAsset | null = null;
const stationCache = new Map<string, WindRoseStationRecord>();
const stationInflight = new Map<string, Promise<WindRoseStationRecord | null>>();

export type WindLoadResult =
  | { ok: true; selection: SiteWindSelection }
  | { ok: false; quietNote: string };

const emptySeason = {
  calmPct: 0,
  prevailingDirDeg: 0,
  meanSpeedMs: 0,
  sectors: [] as number[][],
};

function isStationId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,32}$/.test(id);
}

export function isWindRoseIndex(raw: WindRoseIndex | WindRoseAsset): raw is WindRoseIndex {
  const first = raw.stations[0] as WindRoseStationIndexRecord | WindRoseStationRecord | undefined;
  return Boolean(first && "annualCalmPct" in first && !("seasons" in first));
}

export function windStationAssetUrl(stationId: string, baseUrl: string = import.meta.env.BASE_URL): string {
  return `${baseUrl}${windStationFilePath(stationId)}`;
}

export function indexToSelectionAsset(index: WindRoseIndex): WindRoseAsset {
  return {
    version: index.version,
    speedBinEdgesMs: index.speedBinEdgesMs,
    source: index.source,
    stations: index.stations.map((station) => ({
      id: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      heightM: station.heightM,
      periodStart: station.periodStart,
      periodEnd: station.periodEnd,
      years: station.years,
      sourceZip: station.sourceZip,
      seasons: {
        annual: { ...emptySeason, calmPct: station.annualCalmPct },
        summer: emptySeason,
        autumn: emptySeason,
        winter: { ...emptySeason, calmPct: station.winterCalmPct },
        spring: emptySeason,
      },
    })),
  };
}

function normalizeEdgesAndSource(body: { version: number; speedBinEdgesMs?: number[]; source?: string; stations: unknown[] }) {
  return {
    version: body.version,
    speedBinEdgesMs: body.speedBinEdgesMs ?? [...WIND_SPEED_BIN_EDGES_MS],
    source: body.source ?? WIND_ROSE_SOURCE,
    stations: body.stations,
  };
}

function normalizeLoaded(raw: unknown): WindRoseIndex | WindRoseAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { version?: number; speedBinEdgesMs?: number[]; source?: string; stations?: unknown[] };
  if (typeof body.version !== "number" || !WIND_ROSE_SUPPORTED_ASSET_VERSIONS.includes(body.version)) return null;
  if (!Array.isArray(body.stations)) return null;
  const normalized = normalizeEdgesAndSource({ ...body, version: body.version, stations: body.stations });
  const first = normalized.stations[0] as WindRoseStationIndexRecord | WindRoseStationRecord | undefined;
  if (first && "annualCalmPct" in first && !("seasons" in first)) {
    return normalized as WindRoseIndex;
  }
  return normalized as WindRoseAsset;
}

function normalizeStation(raw: unknown, expectedId: string): WindRoseStationRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const station = raw as WindRoseStationRecord;
  if (station.id !== expectedId || !station.seasons?.annual?.sectors) return null;
  return station;
}

export async function loadWindRoseAsset(fetchImpl: typeof fetch = fetch): Promise<WindRoseAsset | null> {
  const loaded = await loadWindRoseIndex(fetchImpl);
  if (!loaded) return null;
  if (isWindRoseIndex(loaded)) return indexToSelectionAsset(loaded);
  return loaded;
}

export async function loadWindRoseIndex(fetchImpl: typeof fetch = fetch): Promise<WindRoseIndex | WindRoseAsset | null> {
  if (cachedIndex) return cachedIndex;
  if (!indexPromise) {
    indexPromise = (async () => {
      let response: Response;
      try {
        response = await fetchImpl(WIND_INDEX_URL);
      } catch {
        return null;
      }
      if (!response.ok) return null;
      try {
        const loaded = normalizeLoaded((await response.json()) as unknown);
        if (loaded) cachedIndex = loaded;
        return loaded;
      } catch {
        return null;
      }
    })();
  }
  return indexPromise;
}

async function loadWindStationFile(
  stationId: string,
  fetchImpl: typeof fetch,
): Promise<WindRoseStationRecord | null> {
  if (!isStationId(stationId)) return null;
  const cached = stationCache.get(stationId);
  if (cached) return cached;
  const inflight = stationInflight.get(stationId);
  if (inflight) return inflight;
  const pending = (async () => {
    let response: Response;
    try {
      response = await fetchImpl(windStationAssetUrl(stationId));
    } catch {
      return null;
    }
    if (!response.ok) return null;
    try {
      const station = normalizeStation((await response.json()) as unknown, stationId);
      if (station) stationCache.set(stationId, station);
      return station;
    } catch {
      return null;
    }
  })().finally(() => {
    stationInflight.delete(stationId);
  });
  stationInflight.set(stationId, pending);
  return pending;
}

export function resetWindRoseAssetCache(): void {
  cachedIndex = null;
  indexPromise = null;
  stationCache.clear();
  stationInflight.clear();
}

export async function loadSiteWind(
  siteLat: number,
  siteLon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WindLoadResult> {
  const loaded = await loadWindRoseIndex(fetchImpl);
  if (!loaded) {
    return { ok: false, quietNote: "Regional wind data could not be loaded." };
  }
  const asset = isWindRoseIndex(loaded) ? indexToSelectionAsset(loaded) : loaded;
  const selection = siteWindSelection(asset, siteLat, siteLon);
  if (!selection) {
    return { ok: false, quietNote: "Regional wind data could not be loaded." };
  }
  if (!isWindRoseIndex(loaded)) {
    return { ok: true, selection };
  }
  const station = await loadWindStationFile(selection.station.id, fetchImpl);
  if (!station) {
    return { ok: false, quietNote: "Regional wind data could not be loaded." };
  }
  return {
    ok: true,
    selection: {
      ...selection,
      asset: {
        version: loaded.version,
        speedBinEdgesMs: loaded.speedBinEdgesMs,
        source: loaded.source,
        stations: [station],
      },
    },
  };
}
