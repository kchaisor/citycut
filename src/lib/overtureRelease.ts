/** Pinned when the STAC catalog cannot be read. Only a few releases stay hosted. */
export const OVERTURE_RELEASE_FALLBACK = "2026-09-23.1";

const STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json";

export type OvertureReleaseResolution = {
  release: string;
  /** Set only on HTTP 4xx/5xx or network failure; not when the catalog omits `rel=latest`. */
  stacWarning: string | null;
};

type StacLink = { rel: string; href: string; title?: string };

type StacCatalog = {
  stac_version?: string;
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

const RELEASE_ID = /^\d{4}-\d{2}-\d{2}\.\d+$/;

function releaseIdFromHref(href: string): string | null {
  const segment = href.split("/").filter(Boolean).pop();
  return segment && RELEASE_ID.test(segment) ? segment : null;
}

/** Same effective release as main: `latest` when present, else newest STAC `child`, else pin. */
export function releaseFromStacCatalog(catalog: StacCatalog): string {
  const latest = catalog.links?.find((link) => link.rel === "latest");
  const fromLatest = latest?.href ? releaseIdFromHref(latest.href) : null;
  if (fromLatest) return fromLatest;

  const childReleases =
    catalog.links
      ?.filter((link) => link.rel === "child")
      .map((link) => releaseIdFromHref(link.href))
      .filter((id): id is string => id != null) ?? [];
  if (childReleases.length > 0) {
    childReleases.sort();
    return childReleases[childReleases.length - 1]!;
  }

  return OVERTURE_RELEASE_FALLBACK;
}

/** Resolve the current Overture release from STAC. Cached for the session. */
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

export async function resolveOvertureRelease(signal?: AbortSignal): Promise<string> {
  return (await resolveOvertureReleaseWithMeta(signal)).release;
}

/** Test helper. */
export function clearOvertureReleaseCache(): void {
  cachedResolution = null;
}
