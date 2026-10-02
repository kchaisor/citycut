/** Which OSM area tags count as open water for the model, site plan, and exports. */

const OPEN_WATER_TAG_VALUES = new Set([
  "lake",
  "reservoir",
  "river",
  "canal",
  "oxbow",
  "lagoon",
  "lock",
]);

const OPEN_WATERWAY = new Set(["riverbank", "dock", "river"]);

const EXCLUDED_WATER_VALUES = new Set([
  "pond",
  "drain",
  "basin",
  "detention",
  "retention",
  "reflecting_pool",
  "swimming_pool",
  "wastewater",
  "moat",
]);

/** Unnamed `natural=water` patches smaller than this are usually zoo or park plumbing, not lakes. */
export const MIN_UNNAMED_NATURAL_WATER_M2 = 5000;

const EXCLUDED_MAN_MADE = new Set([
  "water_well",
  "storage_tank",
  "wastewater_plant",
  "monitoring_station",
]);

function isTruthyYes(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return lower === "yes" || lower === "seasonal" || lower === "dry";
}

function excludedWaterFeature(tags: Record<string, string>): boolean {
  if (tags.natural === "wetland") return true;
  if (tags.landuse === "basin") return true;
  if (tags.leisure === "swimming_pool") return true;
  if (isTruthyYes(tags.intermittent) || isTruthyYes(tags.seasonal)) return true;
  if (tags.zoo) return true;
  if (tags.attraction === "animal") return true;
  if (tags.man_made && EXCLUDED_MAN_MADE.has(tags.man_made)) return true;
  const waterTag = tags.water?.trim().toLowerCase();
  if (waterTag && EXCLUDED_WATER_VALUES.has(waterTag)) return true;
  const name = tags.name?.trim();
  if (
    name &&
    /\bpool\b/i.test(name) &&
    tags.water !== "lake" &&
    tags.landuse !== "reservoir"
  ) {
    return true;
  }
  return false;
}

function includedWaterFeature(tags: Record<string, string>): boolean {
  if (tags.landuse === "reservoir") return true;
  const waterway = tags.waterway?.split(";")[0];
  if (waterway && OPEN_WATERWAY.has(waterway)) return true;
  if (tags.natural === "water") return true;
  const waterTag = tags.water?.trim().toLowerCase();
  if (waterTag && OPEN_WATER_TAG_VALUES.has(waterTag)) return true;
  return false;
}

/** True when an OSM area relation or closed way should fill the water layer. */
export function isOpenWaterArea(tags: Record<string, string>, areaM2?: number): boolean {
  if (excludedWaterFeature(tags)) return false;
  if (
    tags.natural === "water" &&
    !tags.name &&
    !tags.water &&
    areaM2 != null &&
    areaM2 < MIN_UNNAMED_NATURAL_WATER_M2
  ) {
    return false;
  }
  return includedWaterFeature(tags);
}

/** Tag pairs used in tests and docs for allowed water areas. */
export const OPEN_WATER_TAG_FIXTURES = {
  included: [
    { natural: "water", name: "Trinwarren Tam-Boore" },
    { natural: "water", water: "lake" },
    { landuse: "reservoir" },
    { waterway: "riverbank" },
    { waterway: "river" },
    { natural: "water", water: "reservoir" },
  ],
  excluded: [
    { natural: "wetland" },
    { natural: "water", intermittent: "yes" },
    { natural: "water", water: "drain", intermittent: "yes" },
    { natural: "water", water: "pond" },
    { natural: "water", water: "pond", name: "Royal Park Wetlands Sediment Pond" },
    { natural: "water", zoo: "enclosure" },
    { natural: "water", attraction: "animal", zoo: "enclosure" },
    { leisure: "swimming_pool" },
    { natural: "water", water: "reflecting_pool" },
    { natural: "water", man_made: "wastewater_plant" },
    { landuse: "basin", natural: "water" },
    { natural: "water", name: "Crocodile Paddling Pool" },
  ],
} as const;
