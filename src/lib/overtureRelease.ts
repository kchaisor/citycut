/** Pinned when the STAC catalog cannot be read. Only a few releases stay hosted. */
export const OVERTURE_RELEASE_FALLBACK = "2026-09-23.1";

const STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json";

export type OvertureReleaseResolution = {
  release: string;
  /** Set when STAC failed or returned an error status; still uses {@link release}. */
  stacWarning: string | null;
};

let cachedResolution: OvertureReleaseResolution | null = null;

export function overtureBuildingsUrl(release: string): string {
  return `https://tiles.overturemaps.org/${release}/buildings.pmtiles`;
}

export function overtureTransportationUrl(release: string): string {
  return `https://tiles.overturemaps.org/${release}/transportation.pmtiles`;
}

export function overtureBaseUrl(release: string): string {
  return `https://tiles.overturemaps.org/${release}/base.pmtiles`;
}

/** Resolve the current Overture release from STAC (`latest` link). Cached for the session. */
export async function resolveOvertureReleaseWithMeta(
  signal?: AbortSignal,
): Promise<OvertureReleaseResolution> {
  if (cachedResolution) return cachedResolution;
  try {
    const response = await fetch(STAC_CATALOG_URL, { signal });
    if (!response.ok) {
      cachedResolution = {
        release: OVERTURE_RELEASE_FALLBACK,
        stacWarning: `Overture STAC catalog HTTP ${response.status}; using pinned release ${OVERTURE_RELEASE_FALLBACK}.`,
      };
      return cachedResolution;
    }
    const catalog = (await response.json()) as {
      links?: { rel: string; href: string; title?: string }[];
    };
    const latest = catalog.links?.find((link) => link.rel === "latest");
    const href = latest?.href;
    if (!href) throw new Error("missing latest");
    const release = href.split("/").filter(Boolean).pop();
    if (!release) throw new Error("bad latest href");
    cachedResolution = { release, stacWarning: null };
    return cachedResolution;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    cachedResolution = {
      release: OVERTURE_RELEASE_FALLBACK,
      stacWarning: `Overture STAC catalog unavailable (${detail}); using pinned release ${OVERTURE_RELEASE_FALLBACK}.`,
    };
    return cachedResolution;
  }
}

export async function resolveOvertureRelease(signal?: AbortSignal): Promise<string> {
  return (await resolveOvertureReleaseWithMeta(signal)).release;
}

/** Test helper. */
export function clearOvertureReleaseCache(): void {
  cachedResolution = null;
}
