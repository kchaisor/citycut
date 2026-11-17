import type { WindRoseAsset, SiteWindSelection } from "./windRoseData";
import { WIND_ROSE_SOURCE, WIND_ROSE_SUPPORTED_ASSET_VERSIONS, WIND_SPEED_BIN_EDGES_MS } from "./windRoseData";
import { siteWindSelection } from "./windStation";

const WIND_ASSET_URL = `${import.meta.env.BASE_URL}wind/australia-tmyx.json`;

let assetPromise: Promise<WindRoseAsset | null> | null = null;
let cachedAsset: WindRoseAsset | null = null;

export type WindLoadResult =
  | { ok: true; selection: SiteWindSelection }
  | { ok: false; quietNote: string };

function normalizeAsset(raw: unknown): WindRoseAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Partial<WindRoseAsset>;
  if (typeof body.version !== "number" || !WIND_ROSE_SUPPORTED_ASSET_VERSIONS.includes(body.version)) return null;
  if (!Array.isArray(body.stations)) return null;
  return {
    version: body.version,
    speedBinEdgesMs: body.speedBinEdgesMs ?? [...WIND_SPEED_BIN_EDGES_MS],
    source: body.source ?? WIND_ROSE_SOURCE,
    stations: body.stations,
  };
}

export async function loadWindRoseAsset(fetchImpl: typeof fetch = fetch): Promise<WindRoseAsset | null> {
  if (cachedAsset) return cachedAsset;
  if (!assetPromise) {
    assetPromise = (async () => {
      let response: Response;
      try {
        response = await fetchImpl(WIND_ASSET_URL);
      } catch {
        return null;
      }
      if (!response.ok) return null;
      try {
        const json = (await response.json()) as unknown;
        const asset = normalizeAsset(json);
        if (asset) cachedAsset = asset;
        return asset;
      } catch {
        return null;
      }
    })();
  }
  return assetPromise;
}

export function resetWindRoseAssetCache(): void {
  cachedAsset = null;
  assetPromise = null;
}

export async function loadSiteWind(
  siteLat: number,
  siteLon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WindLoadResult> {
  const asset = await loadWindRoseAsset(fetchImpl);
  if (!asset) {
    return { ok: false, quietNote: "Regional wind data could not be loaded." };
  }
  const selection = siteWindSelection(asset, siteLat, siteLon);
  if (!selection) {
    return { ok: false, quietNote: "Regional wind data could not be loaded." };
  }
  return { ok: true, selection };
}