import type maplibregl from "maplibre-gl";
import { M_PER_DEG_LAT, mPerDegLon } from "./geo";
import { interiorPoint } from "./useCascade";
import { pointInSiteFrame } from "./siteFrame";
import { LANDING_USE_COLOUR_LAYERS, type CutColourMoveStats } from "./mapSiteLayers";
import { fillForTileUse, landingBuildingFill } from "./landingBuildingFill";
import { getColour } from "./colours";
import type { BuildingFeat, SiteFrameShape } from "../types";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";

const UNIFORM_FILL = getColour("--building-uniform");

export function countBuildingsInCutFrame(
  buildings: BuildingFeat[],
  sideM: number,
  frameShape: SiteFrameShape,
): number {
  let count = 0;
  for (const building of buildings) {
    const anchor = interiorPoint(building.ring, building.holes);
    if (pointInSiteFrame(anchor, sideM, frameShape)) count += 1;
  }
  return count;
}

function cutFrameScreenBox(map: maplibregl.Map, sideM: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const center = map.getCenter();
  const half = sideM / 2;
  const dLat = half / M_PER_DEG_LAT;
  const dLon = half / mPerDegLon(center.lat);
  const northWest = map.project([center.lng - dLon, center.lat + dLat]);
  const southEast = map.project([center.lng + dLon, center.lat - dLat]);
  const x0 = Math.min(northWest.x, southEast.x);
  const y0 = Math.min(northWest.y, southEast.y);
  const x1 = Math.max(northWest.x, southEast.x);
  const y1 = Math.max(northWest.y, southEast.y);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  return { x0, y0, x1, y1 };
}

export type InFrameColourCounts = {
  expected: number;
  anyColoured: number;
  finalColoured: number;
  anyFraction: number;
  finalFraction: number;
};

function fillFromRenderedFeature(feature: maplibregl.MapGeoJSONFeature): string | null {
  const layerId = feature.layer?.id;
  if (layerId === "citycut-cut-buildings-fill") {
    const fill = feature.properties?.fill;
    return typeof fill === "string" ? fill : null;
  }
  if (layerId === "citycut-enrichment-tiles-fill") {
    return fillForTileUse(feature.properties?.use as string | undefined);
  }
  return null;
}

/** Dedupe rendered fills; live GeoJSON overlay wins over enrichment tiles for the same id. */
export function mergeDisplayedLandingFills(
  rendered: maplibregl.MapGeoJSONFeature[],
): Map<string, string> {
  const displayed = new Map<string, string>();
  let anon = 0;
  for (const feature of rendered) {
    const fill = fillFromRenderedFeature(feature);
    if (!fill) continue;
    const raw =
      (feature.properties?.overture_id as string | undefined) ??
      (feature.properties?.id as string | undefined);
    const id = raw ? String(raw) : `${feature.layer?.id ?? "layer"}:${anon++}`;
    const layerId = feature.layer?.id ?? "";
    const prev = displayed.get(id);
    if (!prev || layerId === "citycut-cut-buildings-fill") {
      displayed.set(id, fill);
    }
  }
  return displayed;
}

/** Compare map pixels to post-refine building fills (overlay wins over tile). */
export function countInFrameColourCoverage(
  map: maplibregl.Map,
  sideM: number,
  frameShape: SiteFrameShape,
  buildings: BuildingFeat[] | null,
): InFrameColourCounts {
  const expected =
    buildings != null
      ? countBuildingsInCutFrame(buildings, sideM, frameShape)
      : (typeof window !== "undefined" ? window.__citycutCutColourStats?.dragExpectedInFrame : null) ?? 0;
  const box = cutFrameScreenBox(map, sideM);
  if (!box || expected <= 0) {
    return { expected, anyColoured: 0, finalColoured: 0, anyFraction: 0, finalFraction: 0 };
  }
  const layers = LANDING_USE_COLOUR_LAYERS.filter((id) => map.getLayer(id));
  if (layers.length === 0) {
    return { expected, anyColoured: 0, finalColoured: 0, anyFraction: 0, finalFraction: 0 };
  }
  const rendered = map.queryRenderedFeatures(
    [
      [box.x0, box.y0],
      [box.x1, box.y1],
    ],
    { layers },
  );
  const finalById = new Map<string, string>();
  if (buildings) {
    for (const building of buildings) {
      const anchor = interiorPoint(building.ring, building.holes);
      if (!pointInSiteFrame(anchor, sideM, frameShape)) continue;
      const id = building.overtureId;
      if (!id) continue;
      finalById.set(id, landingBuildingFill(building));
    }
  }
  const displayed = mergeDisplayedLandingFills(rendered);
  const inFrameIds = finalById.size > 0 ? new Set(finalById.keys()) : null;
  let anyColoured = 0;
  let finalColoured = 0;
  for (const [id, fill] of displayed) {
    if (inFrameIds && !inFrameIds.has(id)) continue;
    if (fill !== UNIFORM_FILL) anyColoured += 1;
    const want = finalById.get(id);
    if (want != null && fill === want) finalColoured += 1;
  }
  return {
    expected,
    anyColoured,
    finalColoured,
    anyFraction: expected > 0 ? anyColoured / expected : 0,
    finalFraction: expected > 0 ? finalColoured / expected : 0,
  };
}

/** @deprecated use countInFrameColourCoverage */
export function countColouredBuildingsInCutFrame(
  map: maplibregl.Map,
  sideM: number,
  frameShape: SiteFrameShape,
): { coloured: number; ids: string[] } {
  const { anyColoured } = countInFrameColourCoverage(map, sideM, frameShape, null);
  return { coloured: anyColoured, ids: [] };
}

function coverageAnchorMs(stats: CutColourMoveStats, panning: boolean): number {
  if (panning && stats.panStartMs != null) return stats.panStartMs;
  return stats.frameFirstDrawnMs ?? stats.navStartMs ?? performance.now();
}

export function recordColourCoverageProgress(
  map: maplibregl.Map,
  stats: CutColourMoveStats,
  sideM: number,
  frameShape: SiteFrameShape,
  options: { panning: boolean; buildings: BuildingFeat[] | null },
): void {
  if (stats.dragExpectedInFrame == null || stats.dragExpectedInFrame <= 0) return;
  const counts = countInFrameColourCoverage(map, sideM, frameShape, options.buildings);
  const anchor = coverageAnchorMs(stats, options.panning);
  const now = performance.now();
  const elapsed = Math.round(now - anchor);

  if (!options.panning) {
    if (stats.staticFirstAnyColourMs == null && counts.anyColoured > 0) {
      stats.staticFirstAnyColourMs = elapsed;
    }
    if (stats.static95PctAnyMs == null && counts.anyFraction >= 0.95) {
      stats.static95PctAnyMs = elapsed;
    }
    if (stats.staticFirstFinalColourMs == null && counts.finalColoured > 0) {
      stats.staticFirstFinalColourMs = elapsed;
    }
    if (stats.static95PctFinalMs == null && counts.finalFraction >= 0.95) {
      stats.static95PctFinalMs = elapsed;
    }
    if (stats.staticFirstColourMs == null && counts.anyColoured > 0) {
      stats.staticFirstColourMs = elapsed;
    }
  } else {
    if (stats.panFirstAnyColourMs == null && counts.anyColoured > 0) {
      stats.panFirstAnyColourMs = elapsed;
    }
    if (stats.pan95AnyDuringMs == null && counts.anyFraction >= 0.95) {
      stats.pan95AnyDuringMs = elapsed;
    }
    if (stats.panFirstFinalColourMs == null && counts.finalColoured > 0) {
      stats.panFirstFinalColourMs = elapsed;
    }
    if (stats.pan95FinalDuringMs == null && counts.finalFraction >= 0.95) {
      stats.pan95FinalDuringMs = elapsed;
    }
    if (stats.panFirstColourMs == null && counts.anyColoured > 0) {
      stats.panFirstColourMs = elapsed;
    }
    if (stats.pan95DuringMs == null && counts.finalFraction >= 0.95) {
      stats.pan95DuringMs = elapsed;
    }
  }
  if (
    stats.panStartMs != null &&
    !map.isMoving() &&
    stats.pan95FinalAfterReleaseMs == null &&
    counts.finalFraction >= 0.95
  ) {
    stats.pan95FinalAfterReleaseMs = Math.round(now - stats.panStartMs);
  }
  if (
    stats.panStartMs != null &&
    !map.isMoving() &&
    stats.pan95AfterReleaseMs == null &&
    counts.finalFraction >= 0.95
  ) {
    stats.pan95AfterReleaseMs = Math.round(now - stats.panStartMs);
  }
}

/** @deprecated use recordColourCoverageProgress during move */
export function sampleLandingDragColourCoverage(
  map: maplibregl.Map,
  _screenFrame: { left: number; top: number; width: number; height: number },
  stats: CutColourMoveStats,
  sideM: number,
  frameShape: SiteFrameShape,
  buildings: BuildingFeat[] | null,
): void {
  recordColourCoverageProgress(map, stats, sideM, frameShape, {
    panning: map.isMoving(),
    buildings,
  });
}

export type TileFinalMismatchReason =
  | "no_tile_record"
  | "live_zone_refine"
  | "use_or_source_drift"
  | "fill_only_drift";

export type TileFinalAgreement = {
  inFrame: number;
  withTile: number;
  agree: number;
  agreementPct: number;
  mismatchesByUse: Record<string, number>;
  mismatchesByReason: Record<TileFinalMismatchReason, number>;
  unavoidableExamples: { reason: TileFinalMismatchReason; overtureId: string; tileUse: string; liveUse: string }[];
};

/** Compare baked tile `use` fill to final live building fill (in cut frame). */
export function tileFinalColourAgreement(
  buildings: BuildingFeat[],
  byId: Map<string, BuildingEnrichmentRecord>,
  sideM: number,
  frameShape: SiteFrameShape,
): TileFinalAgreement {
  const mismatchesByUse: Record<string, number> = {};
  const mismatchesByReason: Record<TileFinalMismatchReason, number> = {
    no_tile_record: 0,
    live_zone_refine: 0,
    use_or_source_drift: 0,
    fill_only_drift: 0,
  };
  const unavoidableExamples: TileFinalAgreement["unavoidableExamples"] = [];
  let inFrame = 0;
  let withTile = 0;
  let agree = 0;
  for (const building of buildings) {
    const anchor = interiorPoint(building.ring, building.holes);
    if (!pointInSiteFrame(anchor, sideM, frameShape)) continue;
    inFrame += 1;
    const id = building.overtureId;
    if (!id) continue;
    const record = byId.get(id);
    if (!record) {
      mismatchesByReason.no_tile_record += 1;
      continue;
    }
    withTile += 1;
    const tileFill = fillForTileUse(record.use);
    const finalFill = landingBuildingFill(building);
    if (tileFill === finalFill) {
      agree += 1;
    } else {
      const key = building.use ?? "unclassified";
      mismatchesByUse[key] = (mismatchesByUse[key] ?? 0) + 1;
      let reason: TileFinalMismatchReason = "use_or_source_drift";
      if (record.use !== building.use) {
        if (building.useSourceTier === "zone" || building.source === "zone") {
          reason = "live_zone_refine";
        } else {
          reason = "use_or_source_drift";
        }
      } else {
        reason = "fill_only_drift";
      }
      mismatchesByReason[reason] += 1;
      if (unavoidableExamples.length < 12 && reason !== "fill_only_drift") {
        unavoidableExamples.push({
          reason,
          overtureId: id,
          tileUse: record.use,
          liveUse: building.use ?? "unclassified",
        });
      }
    }
  }
  return {
    inFrame,
    withTile,
    agree,
    agreementPct: withTile > 0 ? Math.round((1000 * agree) / withTile) / 10 : 100,
    mismatchesByUse,
    mismatchesByReason,
    unavoidableExamples,
  };
}

declare global {
  interface Window {
    __citycutQaLandingColour?: {
      countInFrame: () => InFrameColourCounts & { coloured: number; fraction: number };
      tileFinalAgreement: () => TileFinalAgreement | null;
      panBy300: () => Promise<void>;
      sideM: number;
      frameShape: SiteFrameShape;
      metricDefinitions: Record<string, string>;
    };
  }
}

export function installLandingColourQaBridge(
  map: maplibregl.Map,
  options: {
    sideM: number;
    frameShape: SiteFrameShape;
    getBuildings: () => BuildingFeat[] | null;
    getEnrichmentById: () => Map<string, BuildingEnrichmentRecord> | null;
  },
): void {
  if (typeof window === "undefined" || !window.location.search.includes("qa=1")) return;
  window.__citycutQaLandingColour = {
    sideM: options.sideM,
    frameShape: options.frameShape,
    metricDefinitions: {
      anchorStaticMs:
        "Elapsed ms from frameFirstDrawnMs (first cut frame on screen) or navStartMs if earlier.",
      anchorPanMs: "Elapsed ms from panStartMs when panBy300 or user pan starts.",
      staticFirstAnyColourMs: "First in-frame building showing any non-uniform use fill after anchor.",
      static95PctAnyMs: "≥95% of in-frame buildings show any non-uniform use fill.",
      staticFirstFinalColourMs:
        "First in-frame building whose rendered fill equals post-refine landingBuildingFill.",
      static95PctFinalMs:
        "≥95% of in-frame buildings whose rendered fill equals post-refine landingBuildingFill.",
      panFirstAnyColourMs: "First any-colour during pan (anchorPanMs).",
      pan95AnyDuringMs: "≥95% any-colour during pan.",
      panFirstFinalColourMs: "First exact final fill during pan.",
      pan95FinalDuringMs: "≥95% exact final fill during pan.",
      pan95FinalAfterReleaseMs: "≥95% exact final fill after pan ends and live refine idles.",
    },
    countInFrame: () => {
      const buildings = options.getBuildings();
      const counts = countInFrameColourCoverage(map, options.sideM, options.frameShape, buildings);
      return {
        ...counts,
        coloured: counts.anyColoured,
        fraction: counts.anyFraction,
      };
    },
    tileFinalAgreement: () => {
      const buildings = options.getBuildings();
      const byId = options.getEnrichmentById();
      if (!buildings || !byId) return null;
      return tileFinalColourAgreement(buildings, byId, options.sideM, options.frameShape);
    },
    panBy300: () =>
      new Promise((resolve) => {
        const stats = window.__citycutCutColourStats;
        if (stats) {
          stats.panStartMs = performance.now();
          stats.panFirstColourMs = null;
          stats.pan95DuringMs = null;
          stats.pan95AfterReleaseMs = null;
          stats.panFirstAnyColourMs = null;
          stats.pan95AnyDuringMs = null;
          stats.panFirstFinalColourMs = null;
          stats.pan95FinalDuringMs = null;
          stats.pan95FinalAfterReleaseMs = null;
        }
        map.panBy([300, 0], { duration: 1000, easing: (t) => t });
        map.once("moveend", () => resolve());
      }),
  };
}
