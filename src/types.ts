export type LonLat = {
  lon: number;
  lat: number;
};

/** East / north meters relative to the cut center. */
export type Pt = [number, number];

export type Ring = Pt[];

export type ModelLayers = {
  buildings: boolean;
  roads: boolean;
  waterGreen: boolean;
  trees: boolean;
};

/**
 * Program of a building. `unclassified` is what remains after the cascade.
 * `mixed_use` is residential together with retail or commercial.
 */
export type BuildingUse =
  | "residential"
  | "commercial"
  | "retail"
  | "mixed_use"
  | "industrial"
  | "civic"
  | "recreation"
  | "outbuilding"
  | "unclassified";

/**
 * Which cascade tier named the use.
 * `osm_tag` is legacy for Overture class / OSM tags on the footprint.
 * `none` is unclassified after every real tier was tried.
 */
export type TypologySource =
  | "osm_tag"
  | "overture_class"
  | "clue"
  | "bca"
  | "zone"
  | "none";

/** Offline tile / pipeline tier id stored as `use_source` on enrichment features. */
export type BuildingUseSourceTier =
  | "overture"
  | "clue"
  | "bca"
  | "zone"
  | "unclassified";

export type UseTierFailure = {
  tier: "zone" | "enrichment_tiles" | "enrichment_coverage";
  /** Short UI line, for example "zones unavailable". */
  message: string;
};

/** Resolved building height source tier (see `buildingHeightResolve.ts` for order). */
export type BuildingHeightTier =
  | "manual"
  | "com"
  | "lidar"
  | "overture_height"
  | "overture_floors"
  | "development_floors"
  | "osm_levels"
  | "zone_default"
  /** Zone-style height but a measured/tag source overlapped and did not apply (see panel note). */
  | "real_source_unmatched";

/** One vertical extrusion inside an OSM footprint (CoM clip or OSM-height remainder). */
export type BuildingExtrusionPart = {
  ring: Ring;
  holes: Ring[];
  height: number;
  /** Metres above ground for the extrusion start (Overture min_height). */
  base?: number;
};

export type BuildingFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  height: number;
  /** Set when height came from footprint/zone fallback, not Overture height or floors. */
  heightFromFallback?: boolean;
  /** Resolved height tier for UI labels. */
  heightTier?: BuildingHeightTier;
  /** CoM DAM floors_above when used for height. */
  developmentFloors?: number;
  /** Panel flag when zone default wins despite nearby unmatched sources. */
  zoneDefaultNote?: string;
  /** Primary CoM structure id when height tier is com (diagnostics / census). */
  comMatchStructureId?: string;
  /** Height (m) of {@link comMatchStructureId}. */
  comMatchHeightM?: number;
  /** Overlap area / OSM footprint area for {@link comMatchStructureId}. */
  comMatchOverlapRatio?: number;
  /** Set when the user overrode height in the 3D view. */
  heightManual?: true;
  use: BuildingUse;
  source: TypologySource;
  /** Offline enrichment tier (matches pipeline `use_source`). */
  useSourceTier?: BuildingUseSourceTier;
  /** Metres from ELVIS LiDAR bake when tier is lidar. */
  lidarHeightM?: number;
  /** Overture `names.primary` or `names.common` when present. */
  overtureName?: string;
  /** Overture `num_floors` when present. */
  numFloors?: number;
  /** Vicmap planning zone code applied in the cut (when zones loaded). */
  zoneCode?: string;
  zoneDescription?: string;
  /** Overture GERS building id when the footprint comes from Overture Maps. */
  overtureId?: string;
  /** OSM way ids from Overture `sources` (`record_id` like w13307317). */
  osmWayIds?: number[];
  /**
   * When Better heights (CoM) clips overlaps, 3D and Rhino extrude each part separately.
   * Site plan and exports still use {@link ring} only.
   */
  extrusionParts?: BuildingExtrusionPart[];
};

/** Highway class used for width and asphalt colour. Rail leaves this unset. */
export type RoadGrade = "arterial" | "local" | "path";

export type RoadFeat = {
  id: number;
  line: Ring;
  width: number;
  kind: "road" | "rail";
  grade?: RoadGrade;
};

export type AreaFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  kind: "water" | "green" | "block";
};

/** Where a tree's height, crown, and trunk came from. */
export type TreeSizeSource = "osm" | "com" | "species" | "default" | "vicmap";

/**
 * Which dataset placed the tree. City of Melbourne wins, then OpenStreetMap,
 * then Vicmap, then canopy infill.
 */
export type TreeTier = "com" | "osm" | "vicmap" | "canopy";

/** Metres. `sizeSource` records which dataset supplied the numbers. */
export type TreeDimensions = {
  height_m: number;
  crown_diameter_m: number;
  trunk_diameter_m: number;
  sizeSource: TreeSizeSource;
};

export type TreeFeat = TreeDimensions & {
  id: number;
  /** East / north meters relative to the cut center. */
  at: Pt;
  /** Copied from OSM when the element already has them. */
  genus?: string;
  species?: string;
  taxon?: string;
  leafType?: string;
  leafCycle?: string;
  /** Massing form chosen from the tags above. */
  /** Dataset that placed this tree. Older fixtures leave this unset. */
  tier?: TreeTier;
};

/**
 * Regular heightfield in the cut's local east/north frame.
 * `heights` are DEM elevations in metres (AHD where the source is the
 * Geoscience Australia lidar; otherwise the Copernicus geoid height).
 * Row 0 is the south edge. Samples include both edges of the square.
 */
export type ContourSourceId = "vicmap-metro" | "vicmap-state" | "dem";

/** One contour polyline in the cut's local east/north frame, clipped to the square. */
export type StoredContour = {
  points: Pt[];
  /** Elevation in metres. Vicmap values are Australian Height Datum. */
  z: number;
};

export type ContourLayer = {
  source: ContourSourceId;
  /** Short label for the Drawing drawer, without the "Contours:" prefix. */
  label: string;
  interval: number;
  lines: StoredContour[];
  attribution: string | null;
  datasetUrl: string | null;
  /** Features returned by the service, before clipping. DEM uses the line count. */
  featureCount: number;
  /** Network time for the Vicmap queries. Zero for a cache hit or the DEM. */
  fetchMs: number;
};

export type TerrainField = {
  cols: number;
  rows: number;
  heights: Float32Array;
  min: number;
  max: number;
  /** Metres between adjacent samples. */
  spacingM: number;
  /** XYZ zoom of the Mapterhorn tiles that were sampled. */
  zoom: number;
  /** Ground metres per source pixel at the cut centre. */
  metresPerPixel: number;
  source: string;
};

export type SiteFrameShape = "square" | "circle";

export type CityModel = {
  placeLabel: string;
  center: LonLat;
  sideM: number;
  /** Cut boundary: square side or circle diameter in metres. */
  frameShape?: SiteFrameShape;
  layers: ModelLayers;
  buildings: BuildingFeat[];
  roads: RoadFeat[];
  /** PTV metro tram centre lines in local metres (when the cut is in metro bounds). */
  tramLines?: Pt[][];
  areas: AreaFeat[];
  trees: TreeFeat[];
  roadKm: number;
  buildingCapHit: boolean;
  /** Set when the combined tree tiers were trimmed to the instance cap. */
  treeCapHit?: boolean;
  sourceNote: string;
  /** Set when the Terrain layer was built. Absent or null keeps the flat ground surface. */
  terrain?: TerrainField | null;
  /** Set when Terrain was requested and the tiles could not be read. */
  terrainError?: string | null;
  /** Vicmap zones skipped after a hard failure. */
  useTierFailures?: UseTierFailure[];
  /** Draw contour lines on the site plan. Vicmap when the cut is in Victoria, otherwise the DEM. */
  contours?: boolean;
  /**
   * Contours for this cut. Set when the Contours layer was on.
   * Absent keeps the older path: marching squares on `terrain` when `contours` is set.
   */
  contourLayer?: ContourLayer | null;
  /** When true, building heights came from City of Melbourne 2023 Building Footprints. */
  comBuildingHeights?: boolean;
  /** Manual height overrides applied in the browser for this session's display and exports. */
  manualHeightEditCount?: number;
  /** True when Overture Microsoft ML footprints appear in the cut. */
  hasMicrosoftFootprints?: boolean;
  /** True when ESA WorldCover land_cover polygons were used for canopy infill. */
  hasEsaLandCover?: boolean;
  /** Geocoded address point when the frame came from address search (or reload via URL). */
  siteAnchor?: LonLat | null;
  /** Vicmap parcel PFI when the boundary loaded. */
  siteParcelPfi?: string | null;
  /** Vicmap parcel SPI when the boundary loaded (may contain a backslash). */
  siteParcelSpi?: string | null;
  /** Boundary polylines in local metres, clipped to the cut square. */
  siteBoundaryLines?: Pt[][];
  /** Building ids highlighted as on-site (yellow). */
  siteBuildingIds?: number[];
  /** Quiet note when the parcel could not be loaded. */
  siteNote?: string | null;
  /** QA (`?qa=1`): overlap fractions for buildings that meet the parcel. */
  siteBuildingQa?: import("./lib/siteBuildings").SiteBuildingOverlap[];
  /** CoM development floor records loaded at model create (Melbourne cuts). */
  developmentDamRecords?: import("./lib/comDevelopmentFloors").DamFloorRecord[];
  /** Building list before CoM 2023 heights (for opt-out toggle). */
  buildingsWithoutCom?: BuildingFeat[];
  /** CoM footprints were applied during model create. */
  comBuildingHeightsApplied?: boolean;
  /** CoM footprint rows prefetched during model create (Melbourne); ModelPage skips refetch when set. */
  comFootprintPrefetch?: import("./lib/comBuildingHeightsTypes").ComBuildingFootprint[];
  /** Non-blocking banners when height datasets failed to load (CoM, DAM, Overture). */
  heightSourceLoadWarnings?: string[];
  /** Road-enclosed block fills (under buildings; not water/green/paper). */
  blocks?: AreaFeat[];
  /** Building enrichment PMTiles could not be read; live zone fallback was used. */
  enrichmentTilesFailed?: boolean;
  /** Offline ELVIS LiDAR bake status for the height-tier legend (e.g. no data, not ordered). */
  lidarHeightTierNote?: string;
};

export type ViewState = {
  lon: number;
  lat: number;
  zoom: number;
};

export type PlaceHit = {
  id: string;
  label: string;
  detail: string;
  lon: number;
  lat: number;
  /** [west, south, east, north] */
  bounds: [number, number, number, number] | null;
};

export type Basemap = "map" | "satellite";

export type UiLayers = ModelLayers & {
  terrain: boolean;
  contours: boolean;
  trees: boolean;
  satellite: boolean;
};
