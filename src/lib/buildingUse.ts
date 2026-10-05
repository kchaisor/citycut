import type { BuildingUse, TypologySource } from "../types";
import { getColour, type ColourKey } from "./colours";

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

export const TYPOLOGY_SOURCES = ["osm_tag", "zone", "none"] as const satisfies readonly TypologySource[];

/** Previous single colour, used when the use colours are turned off. */
export function uniformBuildingColor(): string {
  return getColour("--building-uniform");
}

/**
 * One hue per category. Unclassified stays neutral so a guess from a later
 * tier can still stand out when the view is coloured by source.
 */
function useSwatch(label: string, key: ColourKey, layer: string): { label: string; layer: string; readonly color: string } {
  return {
    label,
    layer,
    get color() {
      return getColour(key);
    },
  };
}

export const BUILDING_USE_META: Record<
  BuildingUse,
  { label: string; color: string; layer: string }
> = {
  residential: useSwatch("Residential", "--use-residential", "Residential"),
  commercial: useSwatch("Commercial", "--use-commercial", "Commercial"),
  retail: useSwatch("Retail", "--use-retail", "Retail"),
  mixed_use: useSwatch("Mixed use", "--use-mixed", "MixedUse"),
  industrial: useSwatch("Industrial", "--use-industrial", "Industrial"),
  civic: useSwatch("Civic", "--use-civic", "Civic"),
  recreation: useSwatch("Recreation", "--use-recreation", "Recreation"),
  outbuilding: useSwatch("Outbuilding", "--use-outbuilding", "Outbuilding"),
  unclassified: useSwatch("Unclassified", "--use-unclassified", "Unclassified"),
};

/**
 * Viewport colours for the source toggle. An OSM tag is solid.
 * A zone is inferred, so it stays lighter and is hatched.
 */
function sourceSwatch(
  label: string,
  key: ColourKey,
  inferred: boolean,
): { label: string; inferred: boolean; readonly color: string } {
  return {
    label,
    inferred,
    get color() {
      return getColour(key);
    },
  };
}

export const SOURCE_META: Record<
  TypologySource,
  { label: string; color: string; inferred: boolean }
> = {
  osm_tag: sourceSwatch("OSM tag", "--source-osm", false),
  zone: sourceSwatch("Zone", "--source-zone", true),
  none: sourceSwatch("Unclassified", "--source-none", false),
};

/** Legend order for source counts. `none` is shown as unclassified. */
export const SOURCE_COUNT_KEYS = ["osm_tag", "zone", "none"] as const satisfies readonly TypologySource[];

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
 * `landuse` values already on the building element. Institutional land is
 * civic. This is still an OSM tag: it is not a separate area query.
 */
const ELEMENT_LANDUSE_USE: Record<string, BuildingUse> = {
  residential: "residential",
  commercial: "commercial",
  retail: "retail",
  industrial: "industrial",
  institutional: "civic",
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
 * including a bare `building=yes`, so the zone tier can run.
 * A `landuse` value on this same element still counts as an OSM tag.
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
    const fromLand = ELEMENT_LANDUSE_USE[value];
    if (fromLand) return fromLand;
  }
  return null;
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
 * `heightM` is the resolved height the extruder already uses: Overture/OSM height,
 * otherwise building:levels × 3 m, otherwise Vicmap zone defaults (see buildingFallbackHeight),
 * then clamped to 3–420 m. C1Z under 15 m is retail; 15 m and taller stays commercial.
 * Overlays (DDO and the rest) and zones outside the table do not match.
 */
export function useFromZone(code: string | null | undefined, heightM: number): BuildingUse | null {
  if (!code) return null;
  const normalised = normaliseZoneCode(code);
  if (normalised === "C1Z") return heightM < C1Z_RETAIL_BELOW_M ? "retail" : "commercial";
  return ZONE_USE[normalised] ?? null;
}

export type CascadeSignals = {
  tags?: Record<string, string> | null;
  zoneCode?: string | null;
  heightM: number;
};

/** OSM tags, then a Vicmap zone, then unclassified. */
export function cascadeUse(signals: CascadeSignals): { use: BuildingUse; source: TypologySource } {
  if (signals.tags) {
    const tagged = classify(signals.tags);
    if (tagged) return { use: tagged, source: "osm_tag" };
  }
  const fromZone = useFromZone(signals.zoneCode, signals.heightM);
  if (fromZone) return { use: fromZone, source: "zone" };
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
