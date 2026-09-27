import type { BuildingUse } from "../types";

export const BUILDING_USES = [
  "residential",
  "office",
  "retail",
  "industrial",
  "education",
  "civic",
  "mixed",
  "unknown",
] as const satisfies readonly BuildingUse[];

/** Previous single colour, used when the use colours are turned off. */
export const UNIFORM_BUILDING_COLOR = "#f6f3ec";

export const BUILDING_USE_META: Record<
  BuildingUse,
  { label: string; color: string; layer: string }
> = {
  residential: { label: "Residential", color: "#d7c4a3", layer: "Residential" },
  office: { label: "Office / commercial", color: "#b7c3ce", layer: "Office" },
  retail: { label: "Retail", color: "#e0b39a", layer: "Retail" },
  industrial: { label: "Industrial", color: "#a9a6a1", layer: "Industrial" },
  education: { label: "Education", color: "#c5d2b4", layer: "Education" },
  civic: { label: "Civic / community", color: "#c3bdd2", layer: "Civic" },
  mixed: { label: "Mixed-use", color: "#d2b8a4", layer: "Mixed-use" },
  unknown: { label: "Other / unknown", color: "#e4d9c8", layer: "Other" },
};

/**
 * `building` and `building:use` values.
 * `yes` is omitted on purpose: it is other/unknown unless another tag says otherwise.
 */
const VALUE_USE: Record<string, BuildingUse> = {
  apartments: "residential",
  house: "residential",
  residential: "residential",
  terrace: "residential",
  dormitory: "residential",
  detached: "residential",
  semidetached_house: "residential",
  bungalow: "residential",
  cabin: "residential",
  hut: "residential",
  farm: "residential",
  hotel: "office",
  motel: "office",
  office: "office",
  commercial: "office",
  retail: "retail",
  supermarket: "retail",
  kiosk: "retail",
  industrial: "industrial",
  warehouse: "industrial",
  factory: "industrial",
  manufacture: "industrial",
  school: "education",
  university: "education",
  college: "education",
  kindergarten: "education",
  civic: "civic",
  public: "civic",
  government: "civic",
  hospital: "civic",
  church: "civic",
  chapel: "civic",
  cathedral: "civic",
  mosque: "civic",
  synagogue: "civic",
  temple: "civic",
  community_centre: "civic",
  library: "civic",
  townhall: "civic",
  train_station: "civic",
  transportation: "civic",
};

const AMENITY_USE: Record<string, BuildingUse> = {
  school: "education",
  university: "education",
  college: "education",
  kindergarten: "education",
  childcare: "education",
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

/** Used only when the building itself does not already name a use. */
const LANDUSE_USE: Record<string, BuildingUse> = {
  residential: "residential",
  commercial: "office",
  retail: "retail",
  industrial: "industrial",
  education: "education",
  institutional: "civic",
  civic: "civic",
};

const PRIORITY: BuildingUse[] = [
  "education",
  "civic",
  "industrial",
  "retail",
  "office",
  "residential",
];

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

/** Program from OSM tags on the same element. Landuse is a fallback for `building=yes`. */
export function classify(tags: Record<string, string>): BuildingUse {
  const building = tokens(tags.building);
  const use = tokens(tags["building:use"]);
  const named = [...building, ...use];
  if (named.some((value) => value === "mixed" || value === "mixed_use")) return "mixed";

  const hits = new Set<BuildingUse>();
  collect(named, VALUE_USE, hits);
  collect(tokens(tags.amenity), AMENITY_USE, hits);
  if (tokens(tags.shop).length > 0) hits.add("retail");
  if (tokens(tags.office).length > 0) hits.add("office");

  if (hits.has("residential") && (hits.has("retail") || hits.has("office"))) return "mixed";
  for (const category of PRIORITY) {
    if (hits.has(category)) return category;
  }

  for (const value of tokens(tags.landuse)) {
    const fromLand = LANDUSE_USE[value];
    if (fromLand) return fromLand;
  }
  return "unknown";
}

export function countUses(buildings: { use: BuildingUse }[]): Record<BuildingUse, number> {
  const counts = Object.fromEntries(BUILDING_USES.map((use) => [use, 0])) as Record<BuildingUse, number>;
  for (const building of buildings) counts[building.use] += 1;
  return counts;
}

export function buildingLayerName(use: BuildingUse): string {
  return `Buildings::${BUILDING_USE_META[use].layer}`;
}
