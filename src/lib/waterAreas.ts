/** Which OSM area tags count as open water for the model, site plan, and exports. */

/** Ponds and lakes smaller than this (m² in the local frame) are hidden; rivers are exempt. */
export const MIN_WATER_AREA_M2 = 500;

const OPEN_WATERWAY = new Set(["riverbank", "dock", "river"]);

/** Explicit `water=*` values that are open water when paired with a polygon. */
const OPEN_WATER_TAG_VALUES = new Set([
  "lake",
  "reservoir",
  "river",
  "canal",
  "oxbow",
  "lagoon",
  "lock",
  "pond",
]);

const EXCLUDED_WATER_VALUES = new Set([
  "drain",
  "ditch",
  "wastewater",
  "basin",
  "reflecting_pool",
]);

const EXCLUDED_BASIN_VALUES = new Set(["detention", "retention", "infiltration"]);

const EXCLUDED_MAN_MADE = new Set(["reservoir_covered", "water_tank"]);

function isTruthyYes(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return lower === "yes" || lower === "seasonal" || lower === "dry";
}

function excludedWaterFeature(tags: Record<string, string>): boolean {
  if (tags.natural === "wetland") return true;
  if (isTruthyYes(tags.intermittent) || isTruthyYes(tags.seasonal)) return true;
  if (tags.amenity === "fountain") return true;
  if (tags.leisure === "swimming_pool" || tags.leisure === "paddling_pool") return true;
  if (tags.zoo === "enclosure") return true;
  if (tags.man_made && EXCLUDED_MAN_MADE.has(tags.man_made)) return true;
  const waterTag = tags.water?.trim().toLowerCase();
  if (waterTag && EXCLUDED_WATER_VALUES.has(waterTag)) return true;
  const basinTag = tags.basin?.trim().toLowerCase();
  if (basinTag && EXCLUDED_BASIN_VALUES.has(basinTag)) return true;
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

/** River polygons stay visible even below {@link MIN_WATER_AREA_M2}. */
export function isRiverWaterArea(tags: Record<string, string>): boolean {
  const waterway = tags.waterway?.split(";")[0];
  if (waterway && OPEN_WATERWAY.has(waterway)) return true;
  if (tags.water?.trim().toLowerCase() === "river") return true;
  return false;
}

/**
 * True when an OSM area should fill the water layer.
 * Pass `areaM2` (absolute area in local metres) to apply {@link MIN_WATER_AREA_M2}.
 */
export function isOpenWaterArea(tags: Record<string, string>, areaM2?: number): boolean {
  if (excludedWaterFeature(tags)) return false;
  if (!includedWaterFeature(tags)) return false;
  if (isRiverWaterArea(tags)) return true;
  if (areaM2 != null && areaM2 < MIN_WATER_AREA_M2) return false;
  return true;
}

/** Tag pairs used in tests and docs for allowed water areas. */
export const OPEN_WATER_TAG_FIXTURES = {
  included: [
    { natural: "water", name: "Trinwarren Tam-Boore" },
    { natural: "water", water: "lake" },
    { natural: "water", water: "pond" },
    { landuse: "reservoir" },
    { waterway: "riverbank" },
    { waterway: "river" },
    { natural: "water", water: "reservoir" },
    { natural: "water", name: "Crocodile Paddling Pool" },
  ],
  excluded: [
    { natural: "wetland" },
    { natural: "water", intermittent: "yes" },
    { natural: "water", water: "drain", intermittent: "yes" },
    { natural: "water", water: "reflecting_pool" },
    { natural: "water", water: "ditch" },
    { natural: "water", zoo: "enclosure" },
    { natural: "water", attraction: "animal", zoo: "enclosure" },
    { leisure: "swimming_pool" },
    { leisure: "paddling_pool" },
    { amenity: "fountain" },
    { natural: "water", man_made: "water_tank" },
    { natural: "water", man_made: "reservoir_covered" },
    { natural: "water", basin: "detention" },
    { natural: "water", water: "wastewater" },
  ],
} as const;
