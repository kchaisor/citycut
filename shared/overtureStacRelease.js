/** Pinned when the STAC catalog cannot be read. Only a few releases stay hosted. */
export const OVERTURE_RELEASE_FALLBACK = "2026-09-23.1";

const RELEASE_ID = /^\d{4}-\d{2}-\d{2}\.\d+$/;

/** Extract a release id from a STAC link href (handles `…/2026-09-23.1/catalog.json`). */
export function releaseIdFromStacHref(href) {
  if (!href) return null;
  for (const segment of href.split("/").filter(Boolean).reverse()) {
    if (RELEASE_ID.test(segment)) return segment;
  }
  return null;
}

/**
 * Newest Overture release described by a STAC root catalog.
 * Order: root `latest` string → `rel=latest` link → newest `rel=child` → pin.
 */
export function releaseFromStacCatalog(catalog) {
  if (catalog && typeof catalog.latest === "string" && RELEASE_ID.test(catalog.latest)) {
    return catalog.latest;
  }

  const latestLink = catalog?.links?.find((link) => link.rel === "latest");
  const fromLatest = latestLink?.href ? releaseIdFromStacHref(latestLink.href) : null;
  if (fromLatest) return fromLatest;

  const latestChild = catalog?.links?.find((link) => link.rel === "child" && link.latest === true);
  const fromLatestChild = latestChild?.href ? releaseIdFromStacHref(latestChild.href) : null;
  if (fromLatestChild) return fromLatestChild;

  const childReleases =
    catalog?.links
      ?.filter((link) => link.rel === "child")
      .map((link) => releaseIdFromStacHref(link.href))
      .filter((id) => id != null) ?? [];
  if (childReleases.length > 0) {
    childReleases.sort();
    return childReleases[childReleases.length - 1];
  }

  return OVERTURE_RELEASE_FALLBACK;
}
