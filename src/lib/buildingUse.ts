import type { BuildingUse, TypologySource } from "../types";

export const BUILDING_USES = [
  "residential",
  "commercial",
  "retail",
  "mixed_use",
  "industrial",
  "civic",
  "recreation",
  "outbuilding",
  "unclassified",
] as const satisfies readonly BuildingUse[];

export const TYPOLOGY_SOURCES = [
  "osm_tag",
  "osm_poi",
  "clue",
  "zone",
  "heuristic",
  "none",
] as const satisfies readonly TypologySource[];

/** Previous single colour, used when the use colours are turned off. */
export const UNIFORM_BUILDING_COLOR = "#f6f3ec";

/**
 * One hue per category. Unclassified stays neutral so a guess from a later
 * tier can still stand out when the view is coloured by source.
 */
export const BUILDING_USE_META: Record<
  BuildingUse,
  { label: string; color: string; layer: string }
> = {
  residential: { label: "Residential", color: "#E06C75", layer: "Residential" },
  commercial: { label: "Commercial", color: "#61AFEF", layer: "Commercial" },
  retail: { label: "Retail", color: "#E5C07B", layer: "Retail" },
  mixed_use: { label: "Mixed use", color: "#C678DD", layer: "MixedUse" },
  industrial: { label: "Industrial", color: "#D19A66", layer: "Industrial" },
  civic: { label: "Civic", color: "#98C379", layer: "Civic" },
  recreation: { label: "Recreation", color: "#56B6C2", layer: "Recreation" },
  outbuilding: { label: "Outbuilding", color: "#5C6370", layer: "Outbuilding" },
  unclassified: { label: "Unclassified", color: "#B8B8B8", layer: "Unclassified" },
};

/**
 * Viewport colours for the source toggle. Observed tiers are solid.
 * Zone and heuristic are inferred, so they stay lighter and are hatched.
 */
export const SOURCE_META: Record<
  TypologySource,
  { label: string; color: string; inferred: boolean }
> = {
  osm_tag: { label: "OSM tag", color: "#1F4E79", inferred: false },
  osm_poi: { label: "OSM POI", color: "#C46B1A", inferred: false },
  clue: { label: "CLUE", color: "#1E7A46", inferred: false },
  zone: { label: "Zone", color: "#A9C4DE", inferred: true },
  heuristic: { label: "Heuristic", color: "#D9C7A6", inferred: true },
  none: { label: "Unclassified", color: "#B8B8B8", inferred: false },
};

/** Legend order for source counts. `none` is shown as unclassified. */
export const SOURCE_COUNT_KEYS = [
  "osm_tag",
  "osm_poi",
  "clue",
  "zone",
  "heuristic",
  "none",
] as const satisfies readonly TypologySource[];

/**
 * `building` and `building:use` values. `yes` is omitted on purpose: a bare
 * yes has no tag match and falls through the cascade.
 * Hut, shed, garage, and the other outbuildings used to be left unknown or
 * called residential; they are outbuildings here.
 */
export const OSM_BUILDING_USE: Record<string, BuildingUse> = {
  house: "residential",
  detached: "residential",
  terrace: "residential",
  apartments: "residential",
  residential: "residential",
  semidetached_house: "residential",
  bungalow: "residential",
  dormitory: "residential",
  cabin: "residential",
  farm: "residential",
  commercial: "commercial",
  office: "commercial",
  hotel: "commercial",
  motel: "commercial",
  retail: "retail",
  supermarket: "retail",
  kiosk: "retail",
  industrial: "industrial",
  warehouse: "industrial",
  factory: "industrial",
  manufacture: "industrial",
  school: "civic",
  university: "civic",
  college: "civic",
  kindergarten: "civic",
  hospital: "civic",
  civic: "civic",
  public: "civic",
  government: "civic",
  church: "civic",
  chapel: "civic",
  mosque: "civic",
  temple: "civic",
  synagogue: "civic",
  cathedral: "civic",
  fire_station: "civic",
  train_station: "civic",
  transportation: "civic",
  community_centre: "civic",
  library: "civic",
  townhall: "civic",
  sports_hall: "recreation",
  stadium: "recreation",
  sports_centre: "recreation",
  pavilion: "recreation",
  grandstand: "recreation",
  shed: "outbuilding",
  garage: "outbuilding",
  garages: "outbuilding",
  carport: "outbuilding",
  hut: "outbuilding",
  roof: "outbuilding",
  greenhouse: "outbuilding",
  outbuilding: "outbuilding",
};

/** Amenity values already read off the building element itself. */
const ELEMENT_AMENITY_USE: Record<string, BuildingUse> = {
  school: "civic",
  university: "civic",
  college: "civic",
  kindergarten: "civic",
  childcare: "civic",
  hospital: "civic",
  clinic: "civic",
  community_centre: "civic",
  library: "civic",
  townhall: "civic",
  place_of_worship: "civic",
  courthouse: "civic",
  police: "civic",
  fire_station: "civic",
  social_facility: "civic",
  public_building: "civic",
  marketplace: "retail",
  restaurant: "retail",
  cafe: "retail",
  fast_food: "retail",
  bar: "retail",
  pub: "retail",
  pharmacy: "retail",
  bank: "retail",
};

/**
 * Landuse values on a separate polygon. Education and institutional land
 * are civic. A landuse tag on the building element uses the same table.
 */
export const LANDUSE_POLYGON_USE: Record<string, BuildingUse> = {
  residential: "residential",
  commercial: "commercial",
  retail: "retail",
  industrial: "industrial",
  education: "civic",
  institutional: "civic",
  recreation_ground: "recreation",
  civic: "civic",
};

/** Amenity values on a POI node. */
export const POI_AMENITY_USE: Record<string, BuildingUse> = {
  school: "civic",
  college: "civic",
  university: "civic",
  kindergarten: "civic",
  hospital: "civic",
  clinic: "civic",
  library: "civic",
  townhall: "civic",
  police: "civic",
  fire_station: "civic",
  place_of_worship: "civic",
  community_centre: "civic",
  restaurant: "retail",
  cafe: "retail",
  bar: "retail",
  pub: "retail",
  fast_food: "retail",
};

export const POI_LEISURE_USE: Record<string, BuildingUse> = {
  sports_centre: "recreation",
  fitness_centre: "recreation",
  swimming_pool: "recreation",
};

const TAG_PRIORITY: BuildingUse[] = [
  "civic",
  "recreation",
  "industrial",
  "retail",
  "commercial",
  "residential",
  "outbuilding",
];

/**
 * Vicmap zone codes after schedule digits are stripped.
 * C1Z is absent: height decides retail or commercial.
 */
export const ZONE_USE: Record<string, BuildingUse> = {
  GRZ: "residential",
  NRZ: "residential",
  RGZ: "residential",
  LDRZ: "residential",
  RLZ: "residential",
  TZ: "residential",
  C2Z: "commercial",
  B1Z: "commercial",
  B2Z: "commercial",
  B3Z: "commercial",
  B4Z: "commercial",
  B5Z: "commercial",
  MUZ: "mixed_use",
  ACZ: "mixed_use",
  CCZ: "mixed_use",
  CDZ: "mixed_use",
  IN1Z: "industrial",
  IN2Z: "industrial",
  IN3Z: "industrial",
  PUZ: "civic",
  PPRZ: "recreation",
  PCRZ: "recreation",
};

/** C1Z below this resolved height is retail. At 15 m and above it stays commercial. */
export const C1Z_RETAIL_BELOW_M = 15;

const CLUE_EXACT: Record<string, BuildingUse> = {
  "house/townhouse": "residential",
  "residential apartment": "residential",
  "student accommodation": "residential",
  "institutional accommodation": "residential",
  office: "commercial",
  "commercial accommodation": "commercial",
  manufacturing: "industrial",
  wholesale: "industrial",
  storage: "industrial",
  "workshop/studio": "industrial",
  "equipment installation": "industrial",
  transport: "industrial",
  warehouse: "industrial",
  "educational/research": "civic",
  "hospital/clinic": "civic",
  "community use": "civic",
  "public display area": "civic",
  "performances, conferences, ceremonies": "civic",
  "performances conferences ceremonies": "civic",
  "entertainment/recreation - indoor": "recreation",
};

function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "no" && part !== "vacant");
}

function collect(values: string[], table: Record<string, BuildingUse>, into: Set<BuildingUse>) {
  for (const value of values) {
    const use = table[value];
    if (use) into.add(use);
  }
}

/**
 * OSM tags on the building element. Returns null when nothing names a use,
 * including a bare `building=yes`, so a later tier can run.
 * Landuse on this same element is the old fallback and counts as osm_tag.
 */
export function classify(tags: Record<string, string>): BuildingUse | null {
  const building = tokens(tags.building);
  const use = tokens(tags["building:use"]);
  const named = [...building, ...use];
  if (named.some((value) => value === "mixed" || value === "mixed_use")) return "mixed_use";

  const hits = new Set<BuildingUse>();
  collect(named, OSM_BUILDING_USE, hits);
  collect(tokens(tags.amenity), ELEMENT_AMENITY_USE, hits);
  if (tokens(tags.shop).length > 0) hits.add("retail");
  if (tokens(tags.office).length > 0) hits.add("commercial");

  if (hits.has("residential") && (hits.has("retail") || hits.has("commercial"))) return "mixed_use";
  for (const category of TAG_PRIORITY) {
    if (hits.has(category)) return category;
  }

  for (const value of tokens(tags.landuse)) {
    const fromLand = LANDUSE_POLYGON_USE[value];
    if (fromLand) return fromLand;
  }
  return null;
}

export function useFromLanduseTag(value: string | undefined): BuildingUse | null {
  for (const token of tokens(value)) {
    const use = LANDUSE_POLYGON_USE[token];
    if (use) return use;
  }
  return null;
}

/** Categories implied by one amenity, shop, office, leisure, or craft node. */
export function usesFromPoi(tags: Record<string, string>): BuildingUse[] {
  const found = new Set<BuildingUse>();
  if (tokens(tags.shop).length > 0) found.add("retail");
  if (tokens(tags.office).length > 0) found.add("commercial");
  if (tokens(tags.craft).length > 0) found.add("industrial");
  for (const value of tokens(tags.leisure)) {
    const use = POI_LEISURE_USE[value];
    if (use) found.add(use);
  }
  for (const value of tokens(tags.amenity)) {
    const use = POI_AMENITY_USE[value];
    if (use) found.add(use);
  }
  const buildingish = [...tokens(tags.building), ...tokens(tags["building:use"])];
  if (buildingish.some((value) => OSM_BUILDING_USE[value] === "residential")) found.add("residential");
  return [...found];
}

function majority(votes: BuildingUse[]): BuildingUse | null {
  if (votes.length === 0) return null;
  const counts = new Map<BuildingUse, number>();
  for (const vote of votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  let best: BuildingUse | null = null;
  let bestN = 0;
  for (const category of TAG_PRIORITY) {
    const n = counts.get(category) ?? 0;
    if (n > bestN) {
      best = category;
      bestN = n;
    }
  }
  return best;
}

/** POI votes inside one footprint. Retail or commercial plus residential is mixed use. */
export function votePoi(votes: BuildingUse[]): BuildingUse | null {
  const unique = new Set(votes);
  if (unique.size === 0) return null;
  if (unique.has("residential") && (unique.has("retail") || unique.has("commercial"))) return "mixed_use";
  return majority(votes);
}

/** CLUE points are a plain majority. Unmapped values are dropped by the caller. */
export function voteClue(votes: BuildingUse[]): BuildingUse | null {
  return majority(votes);
}

/** City of Melbourne predominant_space_use. Unoccupied and unknown values do not match. */
export function useFromClue(value: string | null | undefined): BuildingUse | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text || text.startsWith("unoccupied")) return null;
  if (text.startsWith("retail")) return "retail";
  if (text.startsWith("parking")) return "commercial";
  if (text.startsWith("entertainment/recreation")) return "recreation";
  return CLUE_EXACT[text] ?? null;
}

/**
 * Strip a schedule number that trails the code (GRZ1, PUZ6, SUZ6).
 * A digit that sits before a final Z is part of the code (C1Z, IN3Z, B4Z).
 */
export function normaliseZoneCode(code: string): string {
  return code.trim().toUpperCase().replace(/\d+$/, "");
}

/**
 * Planning zone for a building.
 * `heightM` is the resolved height the extruder already uses: the OSM height
 * tag, otherwise building:levels × 3 m, otherwise 9 m, then clamped to 3–420 m
 * by `buildingHeight`. C1Z under 15 m is retail; 15 m and taller stays commercial.
 * Overlays (DDO and the rest) and zones outside the table do not match.
 */
export function useFromZone(code: string | null | undefined, heightM: number): BuildingUse | null {
  if (!code) return null;
  const normalised = normaliseZoneCode(code);
  if (normalised === "C1Z") return heightM < C1Z_RETAIL_BELOW_M ? "retail" : "commercial";
  return ZONE_USE[normalised] ?? null;
}

/**
 * Footprint area is square metres in the cut's local east/north frame, the
 * same projected metres the extruder uses. Height is the resolved height above.
 * The first matching threshold wins.
 */
export function useFromHeuristic(areaM2: number, heightM: number): BuildingUse | null {
  if (areaM2 < 45) return "outbuilding";
  if (areaM2 < 350 && heightM < 10) return "residential";
  if (areaM2 > 1500 && heightM < 12) return "industrial";
  return null;
}

export type CascadeSignals = {
  tags?: Record<string, string> | null;
  poiVotes?: BuildingUse[];
  landuse?: string | null;
  clueValues?: string[];
  zoneCode?: string | null;
  heightM: number;
  areaM2: number;
};

/** Stop at the first tier that names a use. */
export function cascadeUse(signals: CascadeSignals): { use: BuildingUse; source: TypologySource } {
  if (signals.tags) {
    const tagged = classify(signals.tags);
    if (tagged) return { use: tagged, source: "osm_tag" };
  }
  const fromPoi = votePoi(signals.poiVotes ?? []);
  if (fromPoi) return { use: fromPoi, source: "osm_poi" };
  if (signals.landuse) {
    const fromLand = useFromLanduseTag(signals.landuse);
    if (fromLand) return { use: fromLand, source: "osm_poi" };
  }
  const clueVotes = (signals.clueValues ?? [])
    .map((value) => useFromClue(value))
    .filter((use): use is BuildingUse => use !== null);
  const fromClue = voteClue(clueVotes);
  if (fromClue) return { use: fromClue, source: "clue" };
  const fromZone = useFromZone(signals.zoneCode, signals.heightM);
  if (fromZone) return { use: fromZone, source: "zone" };
  const fromSize = useFromHeuristic(signals.areaM2, signals.heightM);
  if (fromSize) return { use: fromSize, source: "heuristic" };
  return { use: "unclassified", source: "none" };
}

export function countUses(buildings: { use: BuildingUse }[]): Record<BuildingUse, number> {
  const counts = Object.fromEntries(BUILDING_USES.map((use) => [use, 0])) as Record<BuildingUse, number>;
  for (const building of buildings) counts[building.use] += 1;
  return counts;
}

export function countSources(buildings: { source: TypologySource }[]): Record<TypologySource, number> {
  const counts = Object.fromEntries(TYPOLOGY_SOURCES.map((source) => [source, 0])) as Record<
    TypologySource,
    number
  >;
  for (const building of buildings) counts[building.source] += 1;
  return counts;
}

export function buildingLayerName(use: BuildingUse): string {
  return `Buildings::${BUILDING_USE_META[use].layer}`;
}
