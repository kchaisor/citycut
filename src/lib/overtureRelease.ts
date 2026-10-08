import {
  OVERTURE_RELEASE_FALLBACK,
  releaseFromStacCatalog as releaseFromStacCatalogShared,
  releaseIdFromStacHref,
} from "../../shared/overtureStacRelease.js";

export { OVERTURE_RELEASE_FALLBACK, releaseIdFromStacHref };

const STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json";

export type OvertureReleaseResolution = {
  release: string;
  /** Set only on HTTP 4xx/5xx or network failure; not when the catalog omits `rel=latest`. */
  stacWarning: string | null;
};

type StacLink = { rel: string; href: string; title?: string; latest?: boolean };

type StacCatalog = {
  stac_version?: string;
  latest?: string;
  links?: StacLink[];
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

/** Same rules as the enrichment pipeline (`shared/overtureStacRelease.js`). */
export function releaseFromStacCatalog(catalog: StacCatalog): string {
  return releaseFromStacCatalogShared(catalog);
}

/** Resolve from STAC only (transport/base tiles, or landing when no manifest release). Cached for the session. */
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
    const catalog = (await response.json()) as StacCatalog;
    const release = releaseFromStacCatalog(catalog);
    cachedResolution = { release, stacWarning: null };
    return cachedResolution;
  } catch {
    cachedResolution = {
      release: OVERTURE_RELEASE_FALLBACK,
      stacWarning: `Overture STAC catalog unavailable (network error); using pinned release ${OVERTURE_RELEASE_FALLBACK}.`,
    };
    return cachedResolution;
  }
}

/**
 * Landing / enrichment: prefer the baked manifest release so tile tags match Overture fetches.
 * Falls back to STAC (or pin on error) when the manifest is missing or has no release field.
 */
export async function resolveOvertureReleaseForApp(
  manifest: { overtureRelease?: string } | null | undefined,
  signal?: AbortSignal,
): Promise<OvertureReleaseResolution> {
  const baked = manifest?.overtureRelease?.trim();
  if (baked && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(baked)) {
    return { release: baked, stacWarning: null };
  }
  return resolveOvertureReleaseWithMeta(signal);
}

export async function resolveOvertureRelease(signal?: AbortSignal): Promise<string> {
  return (await resolveOvertureReleaseWithMeta(signal)).release;
}

/** Test helper. */
export function clearOvertureReleaseCache(): void {
  cachedResolution = null;
}
