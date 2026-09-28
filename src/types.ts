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

/** Which cascade tier named the use. `none` is unclassified. */
export type TypologySource = "osm_tag" | "osm_poi" | "clue" | "zone" | "heuristic" | "none";

export type UseTierFailure = {
  tier: "clue" | "zone";
  /** Short UI line, for example "zones unavailable". */
  message: string;
};

export type BuildingFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  height: number;
  use: BuildingUse;
  source: TypologySource;
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
  kind: "water" | "green";
};

/** Where a tree's height, crown, and trunk came from. */
export type TreeSizeSource = "osm" | "com" | "species" | "default";

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
  archetype?: string;
};

/**
 * Regular heightfield in the cut's local east/north frame.
 * `heights` are DEM elevations in metres (AHD where the source is the
 * Geoscience Australia lidar; otherwise the Copernicus geoid height).
 * Row 0 is the south edge. Samples include both edges of the square.
 */
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

export type CityModel = {
  placeLabel: string;
  center: LonLat;
  sideM: number;
  layers: ModelLayers;
  buildings: BuildingFeat[];
  roads: RoadFeat[];
  areas: AreaFeat[];
  trees: TreeFeat[];
  roadKm: number;
  buildingCapHit: boolean;
  sourceNote: string;
  /** Set when the Terrain layer was built. Absent or null keeps the flat slab. */
  terrain?: TerrainField | null;
  /** Set when Terrain was requested and the tiles could not be read. */
  terrainError?: string | null;
  /** CLUE or Vicmap zones skipped after a hard failure. */
  useTierFailures?: UseTierFailure[];
  /** Draw contour lines on the SVG plan. Ignored unless `terrain` is set. */
  contours?: boolean;
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
