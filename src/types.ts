export type LonLat = {
  lon: number;
  lat: number;
};

export type Pt = [number, number];

export type Ring = Pt[];

export type ModelLayers = {
  buildings: boolean;
  roads: boolean;
  waterGreen: boolean;
  trees: boolean;
};

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

export type TypologySource =
  | "osm_tag"
  | "overture_class"
  | "clue"
  | "zone"
  | "none";

export type BuildingUseSourceTier =
  | "overture"
  | "clue"
  | "zone"
  | "unclassified";

export type UseTierFailure = {
  tier: "zone" | "enrichment_tiles" | "enrichment_coverage";
  id: string;
  message: string;
};

export type BuildingHeightTier =
  | "manual"
  | "com"
  | "lidar"
  | "overture_height"
  | "overture_floors"
  | "development_floors"
  | "osm_levels"
  | "zone_default"
  | "real_source_unmatched";

export type BuildingExtrusionPart = {
  ring: Ring;
  holes: Ring[];
  height: number;
  base?: number;
};

export type BuildingFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  height: number;
  heightFromFallback?: boolean;
  heightTier?: BuildingHeightTier;
  developmentFloors?: number;
  zoneDefaultNote?: string;
  comMatchStructureId?: string;
  comMatchHeightM?: number;
  comMatchOverlapRatio?: number;
  importedMassing?: true;
  importedTopZ?: number;
  importedColour?: string;
  heightManual?: true;
  use: BuildingUse;
  source: TypologySource;
  nswFacility?: string;
  useSourceTier?: BuildingUseSourceTier;
  lidarHeightM?: number;
  overtureName?: string;
  numFloors?: number;
  zoneCode?: string;
  zoneDescription?: string;
  overtureId?: string;
  osmWayIds?: number[];
  extrusionParts?: BuildingExtrusionPart[];
  meshDrawnBy?: number;
};

export type RoadGrade = "arterial" | "local" | "path";

export type RoadFeat = {
  id: number;
  line: Ring;
  width: number;
  kind: "road" | "rail";
  grade?: RoadGrade;
  /**
   * Set on service ways only (OSM highway=service, Overture road/service): the service subclass
   * ("parking_aisle", "driveway", "alley", "drive_through") or "service" when it has none.
   * 3D, .3dm and city blocks ignore it. The site plan draws parking aisles as car-park ground,
   * and only bridges road gaps that are rimmed by streets, not by service ways.
   */
  service?: string;
};

export type CarParkArea = { ring: Ring; holes: Ring[] };

export type AreaFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  kind: "water" | "green" | "block";
  estimate?: "roundabout-island";
};

export type TreeSizeSource = "osm" | "com" | "species" | "default" | "vicmap";

export type TreeTier = "com" | "osm" | "vicmap" | "canopy";

export type TreeLoadNote = { source: "com" | "vicmap" | "base" | "prebake"; message: string };

export type TreeSourceInfo =
  | { kind: "prebake"; builtAt: string | null; vicmapDate: string | null; comDate: string | null; osmFromFile: boolean }
  | { kind: "live"; reason: string };

export type TreeDimensions = {
  height_m: number;
  crown_diameter_m: number;
  trunk_diameter_m: number;
  sizeSource: TreeSizeSource;
};

export type TreeFeat = TreeDimensions & {
  id: number;
  at: Pt;
  genus?: string;
  species?: string;
  taxon?: string;
  leafType?: string;
  leafCycle?: string;
  tier?: TreeTier;
};

export type ContourSourceId =
  | "vicmap-metro"
  | "vicmap-state"
  | "cos-1m"
  | "nsw-2m"
  | "cos-nsw"
  | "dem";

export type StoredContour = {
  points: Pt[];
  z: number;
};

export type ContourLayer = {
  source: ContourSourceId;
  label: string;
  interval: number;
  lines: StoredContour[];
  attribution: string | null;
  datasetUrl: string | null;
  featureCount: number;
  fetchMs: number;
  notes?: string[];
};

export type TerrainField = {
  cols: number;
  rows: number;
  heights: Float32Array;
  min: number;
  max: number;
  spacingM: number;
  zoom: number;
  metresPerPixel: number;
  source: string;
};

export type SiteFrameShape = "square" | "circle";

export type ModelRegion = "vic" | "nsw";

export type CityModel = {
  placeLabel: string;
  center: LonLat;
  sideM: number;
  frameShape?: SiteFrameShape;
  layers: ModelLayers;
  buildings: BuildingFeat[];
  roads: RoadFeat[];
  tramLines?: Pt[][];
  tramLinesLoadFailed?: boolean;
  areas: AreaFeat[];
  /** Car-park outlines from the base tiles. Plan-only; 3D, .3dm and city blocks ignore them. */
  carParks?: CarParkArea[];
  trees: TreeFeat[];
  roadKm: number;
  buildingCapHit: boolean;
  treeCapHit?: boolean;
  treeLoadNotes?: TreeLoadNote[];
  treeSource?: TreeSourceInfo;
  sourceNote: string;
  terrain?: TerrainField | null;
  terrainError?: string | null;
  terrainNotice?: string | null;
  useTierFailures?: UseTierFailure[];
  contours?: boolean;
  contourLayer?: ContourLayer | null;
  comBuildingHeights?: boolean;
  manualHeightEditCount?: number;
  hasMicrosoftFootprints?: boolean;
  hasEsaLandCover?: boolean;
  siteAnchor?: LonLat | null;
  siteParcelPfi?: string | null;
  siteParcelSpi?: string | null;
  siteBoundaryLines?: Pt[][];
  siteBuildingIds?: number[];
  siteNote?: string | null;
  siteBuildingQa?: import("./lib/siteBuildings").SiteBuildingOverlap[];
  developmentDamRecords?: import("./lib/comDevelopmentFloors").DamFloorRecord[];
  buildingsWithoutCom?: BuildingFeat[];
  comBuildingHeightsApplied?: boolean;
  buildingsHeightResolved?: boolean;
  comFootprintPrefetch?: import("./lib/comBuildingHeightsTypes").ComBuildingFootprint[];
  comFootprintFetchError?: string | null;
  heightSourceLoadWarnings?: string[];
  blocks?: AreaFeat[];
  enrichmentTilesFailed?: boolean;
  lidarHeightTierNote?: string;
  region?: ModelRegion | null;
  nsw?: import("./lib/nswLayers").NswLayers | null;
  nswWaterNote?: string | null;
  nswRoadSurface?: { nswCorridorM2: number; overtureM2: number } | null;
  nswUseMatched?: number;
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
  bounds: [number, number, number, number] | null;
};

export type Basemap = "map" | "satellite";

export type UiLayers = ModelLayers & {
  terrain: boolean;
  contours: boolean;
  trees: boolean;
  satellite: boolean;
};
