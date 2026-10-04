/** Pinned when the STAC catalog cannot be read. Only a few releases stay hosted. */
export const OVERTURE_RELEASE_FALLBACK = "2026-09-23.1";

const STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json";

let cachedRelease: string | null = null;

export function overtureBuildingsUrl(release: string): string {
  return `https://tiles.overturemaps.org/${release}/buildings.pmtiles`;
}

type StacCatalog = {
  stac_version?: string;
  links?: { rel: string; href: string; title?: string }[];
};

/** Resolve the current Overture release from STAC (`latest` link). Cached for the session. */
export async function resolveOvertureRelease(signal?: AbortSignal): Promise<string> {
  if (cachedRelease) return cachedRelease;
  try {
    const response = await fetch(STAC_CATALOG_URL, { signal });
    if (!response.ok) throw new Error(String(response.status));
    const catalog = (await response.json()) as StacCatalog;
    const latest = catalog.links?.find((link) => link.rel === "latest");
    const href = latest?.href;
    if (!href) throw new Error("missing latest");
    const release = href.split("/").filter(Boolean).pop();
    if (!release) throw new Error("bad latest href");
    cachedRelease = release;
    return release;
  } catch {
    cachedRelease = OVERTURE_RELEASE_FALLBACK;
    return OVERTURE_RELEASE_FALLBACK;
  }
}

/** Test helper. */
export function clearOvertureReleaseCache(): void {
  cachedRelease = null;
}
