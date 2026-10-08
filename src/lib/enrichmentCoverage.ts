import type { EnrichmentManifest } from "./buildingEnrichmentTiles";

export type GeoBounds = { west: number; south: number; east: number; north: number };

export function boundsIntersect(a: GeoBounds, b: GeoBounds): boolean {
  return !(a.east < b.west || a.west > b.east || a.north < b.south || a.south > b.north);
}

export function cutCenterOutsideBuiltBbox(
  center: { lat: number; lon: number },
  manifest: EnrichmentManifest | null,
): boolean {
  const built = manifest?.builtBbox;
  if (!built) return false;
  return (
    center.lon < built.west ||
    center.lon > built.east ||
    center.lat < built.south ||
    center.lat > built.north
  );
}

export function enrichmentCoverageMessage(manifest: EnrichmentManifest | null): string | null {
  if (!manifest?.builtBbox) return null;
  const { west, south, east, north } = manifest.builtBbox;
  const region =
    manifest.regionName ??
    (north > -37.8 && east < 145.05 && west > 144.88
      ? "City of Melbourne (committed fallback tiles)"
      : "offline building use tiles");
  return `Offline building use tiles cover ${region} (${west.toFixed(2)}°E–${east.toFixed(2)}°E, ${south.toFixed(2)}°S–${north.toFixed(2)}°S). Outside that area, landing colours and cuts use live Vicmap zones until tiles are baked here.`;
}
