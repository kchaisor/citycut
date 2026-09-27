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

export type BuildingFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  height: number;
};

export type RoadFeat = {
  id: number;
  line: Ring;
  width: number;
  kind: "road" | "rail";
};

export type AreaFeat = {
  id: number;
  ring: Ring;
  holes: Ring[];
  kind: "water" | "green";
};

export type TreeFeat = {
  id: number;
  /** East / north meters relative to the cut center. */
  at: Pt;
  height: number;
  crownDiameter: number;
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
