import type { BuildingFeat } from "../types";
import type { BuildingEnrichmentRecord, EnrichmentManifest } from "./buildingEnrichmentTiles";
import type { GeoBounds } from "./enrichmentCoverage";

export function cutBoundsInsideBuiltBbox(bounds: GeoBounds, manifest: EnrichmentManifest | null): boolean {
  const built = manifest?.builtBbox;
  if (!built) return false;
  return (
    bounds.west >= built.west &&
    bounds.east <= built.east &&
    bounds.south >= built.south &&
    bounds.north <= built.north
  );
}

/** Footprints with no offline row still need live Vicmap when the rest of the cut is tiled. */
export function mergedNeedsLiveZoneRefine(
  merged: BuildingFeat[],
  byId: Map<string, BuildingEnrichmentRecord>,
): boolean {
  return merged.some((building) => {
    if (!building.overtureId) return true;
    return !byId.has(building.overtureId);
  });
}

export function manifestOvertureReleaseMatchesApp(
  manifest: EnrichmentManifest | null,
  appOvertureRelease: string,
): boolean {
  const baked = manifest?.overtureRelease?.trim();
  if (!baked) return false;
  return baked === appOvertureRelease;
}

export function shouldRunLiveZoneRefine(options: {
  tilesOnly: boolean;
  forceLiveRefine: boolean;
  enrichmentError: string | null;
  manifestMatchesAppTables: boolean;
  manifest: EnrichmentManifest | null;
  appOvertureRelease: string;
  cutBounds: GeoBounds;
  merged: BuildingFeat[];
  byId: Map<string, BuildingEnrichmentRecord>;
}): boolean {
  if (options.tilesOnly) return false;
  if (options.forceLiveRefine) return true;
  if (options.enrichmentError) return true;
  if (!options.manifestMatchesAppTables) return true;
  if (!manifestOvertureReleaseMatchesApp(options.manifest, options.appOvertureRelease)) return true;
  if (!cutBoundsInsideBuiltBbox(options.cutBounds, options.manifest)) return true;
  if (mergedNeedsLiveZoneRefine(options.merged, options.byId)) return true;
  return false;
}
