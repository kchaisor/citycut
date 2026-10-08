import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { dashSegments, readDrawingStyle } from "./drawingStyle";
import { landingCutBuildingsBeforeLayer } from "./mapBasemapLayers";
import { cutBuildingsGeoJson, cutColourMaskGeoJson } from "./mapCutGeoJson";
import { mapSiteLayerPaint, siteBoundaryGeoJson, siteBuildingsGeoJson } from "./mapSiteGeoJson";
import { buildingUseFillColorExpression } from "./landingBuildingUsePaint";
import { ensurePmtilesProtocol, sharedPmtilesForAbsoluteUrl } from "./registerPmtilesProtocol";
import type { BuildingFeat, LonLat, SiteFrameShape } from "../types";
import type { SiteParcel } from "./vicmapSiteParcel";

const BUILDINGS_SOURCE = "citycut-site-buildings";
const BOUNDARY_SOURCE = "citycut-site-boundary";
const BUILDINGS_LAYER = "citycut-site-buildings-fill";
const BOUNDARY_LAYER = "citycut-site-boundary-line";

const CUT_MASK_SOURCE = "citycut-cut-mask";
const CUT_BUILDINGS_SOURCE = "citycut-cut-buildings";
const ENRICHMENT_SOURCE = "citycut-enrichment-tiles";
const CUT_MASK_BUILDINGS_LAYER = "citycut-cut-mask-buildings-fill";
const CUT_BUILDINGS_LAYER = "citycut-cut-buildings-fill";
export const ENRICHMENT_TILES_LAYER = "citycut-enrichment-tiles-fill";

export const CUT_COLOUR_SOURCE_IDS = [CUT_BUILDINGS_SOURCE] as const;

/** Query order: live overlay first so rendered picks match paint stack (overlay above tiles). */
export const LANDING_USE_COLOUR_LAYERS = [CUT_BUILDINGS_LAYER, ENRICHMENT_TILES_LAYER] as const;

/** Run when the style is ready (`isStyleLoaded`), including after async manifest fetches. */
export function runWhenMapStyleReady(
  map: maplibregl.Map,
  fn: () => void,
  isCancelled: () => boolean = () => false,
): () => void {
  let finished = false;
  const run = () => {
    if (finished || isCancelled() || !map.isStyleLoaded()) return;
    finished = true;
    map.off("styledata", run);
    map.off("idle", run);
    fn();
  };
  run();
  if (!finished) {
    map.on("styledata", run);
    map.on("idle", run);
  }
  return () => {
    finished = true;
    map.off("styledata", run);
    map.off("idle", run);
  };
}

/** Bottom → top: enrichment tiles, live delta overlay, frame mask. */
export function ensureLandingColourLayerOrder(map: maplibregl.Map): void {
  if (
    !map.getLayer(ENRICHMENT_TILES_LAYER) ||
    !map.getLayer(CUT_BUILDINGS_LAYER) ||
    !map.getLayer(CUT_MASK_BUILDINGS_LAYER)
  ) {
    return;
  }
  try {
    map.moveLayer(CUT_BUILDINGS_LAYER, CUT_MASK_BUILDINGS_LAYER);
    map.moveLayer(ENRICHMENT_TILES_LAYER, CUT_BUILDINGS_LAYER);
  } catch {
    /* style not ready */
  }
}

export type CutColourMoveStats = {
  maskSetData: number;
  colourSetData: number;
  layerRebuilds: number;
  /** QA: first cut frame overlay drawn (performance.now). */
  frameFirstDrawnMs?: number | null;
  /** QA: map idle after use-colour fill applied. */
  colourFillMs?: number | null;
  /** QA: ms spent in landing building fetch + merge (excludes 280 ms debounce). */
  colourFetchMs?: number | null;
  /** QA: enrichment PMTiles read in that fetch. */
  colourEnrichmentMs?: number | null;
  /** QA: refineBuildingUses (zones/WFS) in that fetch. */
  colourRefineMs?: number | null;
  /** QA: first in-frame use colour seen while dragging. */
  dragFirstColourMs?: number | null;
  /** QA: ≥95% of expected in-frame buildings coloured after a drag. */
  drag95PctColourMs?: number | null;
  /** QA: in-frame building count from the last live refine (denominator for drag coverage). */
  dragExpectedInFrame?: number | null;
  /** QA: navigation start (performance.now) for static metrics. */
  navStartMs?: number | null;
  /** QA: first in-frame any use colour on initial load (before any drag). */
  staticFirstColourMs?: number | null;
  staticFirstAnyColourMs?: number | null;
  static95PctAnyMs?: number | null;
  staticFirstFinalColourMs?: number | null;
  /** QA: ≥95% exact final fill on initial load (post-refine landingBuildingFill). */
  static95PctFinalMs?: number | null;
  /** QA: first in-frame any colour during the current pan. */
  panFirstColourMs?: number | null;
  panFirstAnyColourMs?: number | null;
  pan95AnyDuringMs?: number | null;
  panFirstFinalColourMs?: number | null;
  /** QA: ≥95% exact final fill during pan. */
  pan95DuringMs?: number | null;
  pan95FinalDuringMs?: number | null;
  /** QA: ≥95% exact final fill after pan release + live refine. */
  pan95AfterReleaseMs?: number | null;
  pan95FinalAfterReleaseMs?: number | null;
  /** QA: performance.now when panBy starts. */
  panStartMs?: number | null;
  /** QA: buildings with tile `useSourceTier` after merge. */
  landingUseFromTiles?: number | null;
  /** QA: buildings newly classified by live refine (`source` was `none`). */
  landingUseFromLiveRefine?: number | null;
  landingUseUnclassified?: number | null;
  landingUseTotal?: number | null;
  landingBuildingCapHit?: boolean;
  landingOvertureFragmentCount?: number | null;
  tilesOnlyMode?: boolean;
  landingUseTierCounts?: Record<string, number> | null;
};

declare global {
  interface Window {
    __citycutCutColourStats?: CutColourMoveStats;
  }
}

function qaStats(): CutColourMoveStats | null {
  if (typeof window === "undefined" || !window.location.search.includes("qa=1")) return null;
  if (!window.__citycutCutColourStats) {
    window.__citycutCutColourStats = {
      maskSetData: 0,
      colourSetData: 0,
      layerRebuilds: 0,
      frameFirstDrawnMs: null,
      colourFillMs: null,
      colourFetchMs: null,
      colourEnrichmentMs: null,
      colourRefineMs: null,
      dragFirstColourMs: null,
      drag95PctColourMs: null,
      dragExpectedInFrame: null,
      navStartMs: null,
      staticFirstColourMs: null,
      staticFirstAnyColourMs: null,
      static95PctAnyMs: null,
      staticFirstFinalColourMs: null,
      static95PctFinalMs: null,
      panFirstColourMs: null,
      panFirstAnyColourMs: null,
      pan95AnyDuringMs: null,
      panFirstFinalColourMs: null,
      pan95DuringMs: null,
      pan95FinalDuringMs: null,
      pan95AfterReleaseMs: null,
      pan95FinalAfterReleaseMs: null,
      panStartMs: null,
    };
  }
  return window.__citycutCutColourStats;
}

function bumpColourSetData(): void {
  const stats = qaStats();
  if (stats) stats.colourSetData += 1;
}

function markColourFillWhenIdle(map: maplibregl.Map, onlyIfUnset = false): void {
  map.once("idle", () => {
    const idleStats = qaStats();
    if (!idleStats) return;
    if (onlyIfUnset && idleStats.colourFillMs != null) return;
    idleStats.colourFillMs = performance.now();
  });
}

export function removeMapCutColourLayers(map: maplibregl.Map): void {
  for (const layer of [CUT_MASK_BUILDINGS_LAYER, CUT_BUILDINGS_LAYER, ENRICHMENT_TILES_LAYER]) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  for (const source of [CUT_MASK_SOURCE, CUT_BUILDINGS_SOURCE, ENRICHMENT_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source);
  }
}

function buildingsGeoJson(dataOrigin: LonLat, sideM: number, buildings: BuildingFeat[]): GeoJSON.FeatureCollection {
  return cutBuildingsGeoJson(buildings, dataOrigin, sideM, "square", { clipToFrame: false });
}

/**
 * Enrichment PMTiles + mask + empty live overlay. Use colours stream in while the map moves;
 * live GeoJSON fills gaps and overrides after moveend.
 */
export function ensureMapLandingColourShell(
  map: maplibregl.Map,
  options: {
    enrichmentAbsoluteUrl: string | null;
    maskCenter: LonLat;
    cutSideM: number;
    frameShape: SiteFrameShape;
  },
): void {
  ensurePmtilesProtocol();
  const stats = qaStats();
  const buildingsBefore = landingCutBuildingsBeforeLayer(map);
  const mask = cutColourMaskGeoJson(options.maskCenter, options.cutSideM, options.frameShape);

  if (!map.getSource(CUT_MASK_SOURCE)) {
    map.addSource(CUT_MASK_SOURCE, { type: "geojson", data: mask });
  } else {
    (map.getSource(CUT_MASK_SOURCE) as maplibregl.GeoJSONSource).setData(mask);
  }

  if (!map.getSource(CUT_BUILDINGS_SOURCE)) {
    map.addSource(CUT_BUILDINGS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (options.enrichmentAbsoluteUrl && !map.getSource(ENRICHMENT_SOURCE)) {
    sharedPmtilesForAbsoluteUrl(options.enrichmentAbsoluteUrl);
    map.addSource(ENRICHMENT_SOURCE, {
      type: "vector",
      url: `pmtiles://${options.enrichmentAbsoluteUrl}`,
    });
    if (stats) stats.layerRebuilds += 1;
  }

  if (!map.getLayer(CUT_MASK_BUILDINGS_LAYER)) {
    map.addLayer(
      {
        id: CUT_MASK_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_MASK_SOURCE,
        paint: { "fill-color": getColour("--landing-building-mask"), "fill-opacity": 1 },
      },
      buildingsBefore,
    );
  }

  if (!map.getLayer(CUT_BUILDINGS_LAYER)) {
    map.addLayer(
      {
        id: CUT_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_BUILDINGS_SOURCE,
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.94 },
      },
      CUT_MASK_BUILDINGS_LAYER,
    );
  }

  if (options.enrichmentAbsoluteUrl && !map.getLayer(ENRICHMENT_TILES_LAYER)) {
    map.addLayer(
      {
        id: ENRICHMENT_TILES_LAYER,
        type: "fill",
        source: ENRICHMENT_SOURCE,
        "source-layer": "building_enrichment",
        minzoom: 13,
        paint: {
          "fill-color": buildingUseFillColorExpression(),
          "fill-opacity": 0.94,
        },
      },
      CUT_BUILDINGS_LAYER,
    );
    markColourFillWhenIdle(map, true);
  }

  ensureLandingColourLayerOrder(map);
}

/** Moves the shared mask GeoJSON (rAF-throttled in MapStage while the frame is dragged). */
export function updateMapCutColourMask(
  map: maplibregl.Map,
  options: { center: LonLat; sideM: number; frameShape: SiteFrameShape },
): void {
  if (!map.getSource(CUT_MASK_SOURCE)) return;
  const data = cutColourMaskGeoJson(options.center, options.sideM, options.frameShape);
  (map.getSource(CUT_MASK_SOURCE) as maplibregl.GeoJSONSource).setData(data);
  const stats = qaStats();
  if (stats) stats.maskSetData += 1;
}

/** Swap live-refine building fill data without rebuilding layers (viewport refetch). */
export function setMapCutColourData(
  map: maplibregl.Map,
  options: {
    dataOrigin: LonLat;
    sideM: number;
    buildings: BuildingFeat[];
  },
): boolean {
  if (!map.getSource(CUT_BUILDINGS_SOURCE)) {
    return false;
  }
  const buildings = buildingsGeoJson(options.dataOrigin, options.sideM, options.buildings);
  const buildingSource = map.getSource(CUT_BUILDINGS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (buildingSource) {
    buildingSource.setData(buildings);
    bumpColourSetData();
    markColourFillWhenIdle(map);
  }
  return true;
}

/** Legacy full-stack rebuild when enrichment tiles are unavailable. */
export function updateMapCutColourLayers(
  map: maplibregl.Map,
  options: {
    dataOrigin: LonLat;
    dataSideM: number;
    maskCenter: LonLat;
    cutSideM: number;
    frameShape: SiteFrameShape;
    buildings: BuildingFeat[];
  },
): void {
  removeMapCutColourLayers(map);
  const stats = qaStats();
  if (stats) stats.layerRebuilds += 1;
  const buildingsBefore = landingCutBuildingsBeforeLayer(map);
  const buildings = buildingsGeoJson(options.dataOrigin, options.dataSideM, options.buildings);

  const mask = cutColourMaskGeoJson(options.maskCenter, options.cutSideM, options.frameShape);
  map.addSource(CUT_MASK_SOURCE, { type: "geojson", data: mask });

  if (buildings.features.length > 0) {
    map.addSource(CUT_BUILDINGS_SOURCE, { type: "geojson", data: buildings });
    map.addLayer(
      {
        id: CUT_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_BUILDINGS_SOURCE,
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.94 },
      },
      buildingsBefore,
    );
    map.addLayer(
      {
        id: CUT_MASK_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_MASK_SOURCE,
        paint: { "fill-color": getColour("--landing-building-mask"), "fill-opacity": 1 },
      },
      buildingsBefore,
    );
    markColourFillWhenIdle(map, true);
  }
}

export function removeMapSiteLayers(map: maplibregl.Map): void {
  if (map.getLayer(BOUNDARY_LAYER)) map.removeLayer(BOUNDARY_LAYER);
  if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
  if (map.getSource(BOUNDARY_SOURCE)) map.removeSource(BOUNDARY_SOURCE);
  if (map.getSource(BUILDINGS_SOURCE)) map.removeSource(BUILDINGS_SOURCE);
}

export function updateMapSiteLayers(
  map: maplibregl.Map,
  options: {
    center: LonLat;
    buildings: BuildingFeat[];
    siteBuildingIds: number[];
    parcel: SiteParcel | null;
  },
): void {
  removeMapSiteLayers(map);
  const paint = mapSiteLayerPaint();
  const buildingCollection = siteBuildingsGeoJson(options.buildings, options.siteBuildingIds, options.center);
  if (buildingCollection.features.length > 0) {
    map.addSource(BUILDINGS_SOURCE, { type: "geojson", data: buildingCollection });
    map.addLayer({
      id: BUILDINGS_LAYER,
      type: "fill",
      source: BUILDINGS_SOURCE,
      paint: {
        "fill-color": paint.buildingFill,
        "fill-opacity": 0.92,
      },
    });
  }
  if (options.parcel) {
    const boundaryCollection = siteBoundaryGeoJson(options.parcel, options.center);
    if (boundaryCollection.features.length > 0) {
      map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: boundaryCollection });
      const dash = dashSegments(readDrawingStyle().siteBoundary.dash);
      const dashArray = dash && dash.length >= 2 ? [dash[0]! * 3, dash[1]! * 3] : undefined;
      map.addLayer({
        id: BOUNDARY_LAYER,
        type: "line",
        source: BOUNDARY_SOURCE,
        paint: {
          "line-color": paint.boundaryColor,
          "line-width": 2.5,
          ...(dashArray ? { "line-dasharray": dashArray } : {}),
        },
      });
    }
  }
}
