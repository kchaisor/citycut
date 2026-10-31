
export const UNTAGGED_WATER_MIN_AREA_M2 = 10_000;

const KEEP_WATERWAY = new Set(["riverbank", "river", "canal", "dock"]);

const KEEP_WATER_TAG = new Set([
  "lake",
  "lagoon",
  "reservoir",
  "river",
  "canal",
  "oxbow",
  "stream",
  "harbour",
]);

const EXCLUDED_WATER_TAG = new Set([
  "pond",
  "drain",
  "ditch",
  "wastewater",
  "basin",
  "reflecting_pool",
]);

const EXCLUDED_BASIN_VALUES = new Set(["detention", "retention", "infiltration"]);

const EXCLUDED_MAN_MADE = new Set(["reservoir_covered", "water_tank"]);

export const UNLISTED_WATER_SUBTAGS = [
  "lock",
  "moat",
  "fishpond",
  "rapids",
  "waterfall",
  "yes",
  "salt",
  "fresh",
  "tidal",
  "shingle",
] as const;

function waterSubtag(tags: Record<string, string>): string | undefined {
  const raw = tags.water?.trim().toLowerCase();
  return raw || undefined;
}

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
  const w = waterSubtag(tags);
  if (w === "pond" || (w && EXCLUDED_WATER_TAG.has(w))) return true;
  const basinTag = tags.basin?.trim().toLowerCase();
  if (basinTag && EXCLUDED_BASIN_VALUES.has(basinTag)) return true;
  return false;
}

export function isRiverWaterArea(tags: Record<string, string>): boolean {
  const waterway = tags.waterway?.split(";")[0];
  if (waterway && KEEP_WATERWAY.has(waterway)) return true;
  const w = waterSubtag(tags);
  if (w && ["river", "canal", "oxbow", "stream"].includes(w)) return true;
  return false;
}

function keepReservoir(tags: Record<string, string>): boolean {
  if (tags.man_made === "reservoir_covered") return false;
  if (tags.landuse === "reservoir") return true;
  if (waterSubtag(tags) === "reservoir") return true;
  return false;
}

export function isOpenWaterArea(tags: Record<string, string>, areaM2?: number): boolean {
  if (excludedWaterFeature(tags)) return false;

  const waterway = tags.waterway?.split(";")[0];
  if (waterway && KEEP_WATERWAY.has(waterway)) return true;

  if (keepReservoir(tags)) return true;

  const w = waterSubtag(tags);
  if (w && KEEP_WATER_TAG.has(w)) return true;
  if (w) return false;

  if (tags.natural === "water") {
    if (areaM2 == null) return true;
    return areaM2 >= UNTAGGED_WATER_MIN_AREA_M2;
  }

  return false;
}

export const OPEN_WATER_TAG_FIXTURES = {
  included: [
    { natural: "water", water: "lake" },
    { natural: "water", water: "lagoon" },
    { landuse: "reservoir" },
    { waterway: "riverbank" },
    { waterway: "river" },
    { natural: "water", water: "reservoir" },
    { natural: "water", water: "river" },
    { natural: "water", water: "canal" },
    { natural: "water", water: "harbour" },
  ],
  excluded: [
    { natural: "water", water: "pond" },
    { natural: "wetland" },
    { natural: "water", intermittent: "yes" },
    { natural: "water", water: "drain", intermittent: "yes" },
    { natural: "water", water: "reflecting_pool" },
    { natural: "water", water: "ditch" },
    { natural: "water", zoo: "enclosure" },
    { leisure: "swimming_pool" },
    { leisure: "paddling_pool" },
    { amenity: "fountain" },
    { natural: "water", man_made: "reservoir_covered" },
    { landuse: "reservoir", man_made: "reservoir_covered" },
    { natural: "water", water: "lock" },
  ],
} as const;
