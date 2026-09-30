import { explicitLengthUnit, parseLooseNumber, parseMeters } from "./height";
import { archetypeSize, resolveArchetype } from "./treeMap";
import type { TreeDimensions, TreeSizeSource, TreeTier } from "../types";

const generic = archetypeSize("generic");

/** Typical Melbourne street tree when nothing else is known. Matches `treeMap.json` generic. */
export const DEFAULT_TREE_HEIGHT = generic.height_m;
export const DEFAULT_CROWN_DIAMETER = generic.crown_diameter_m;
export const DEFAULT_TRUNK_DIAMETER = generic.trunk_diameter_m;

const MIN_HEIGHT = 2;
const MAX_HEIGHT = 40;
const MIN_CROWN = 1;
const MAX_CROWN = 25;
const MIN_TRUNK = 0.05;
const MAX_TRUNK = 2;
/**
 * A bare `diameter` this wide is not a metre measurement. Street-tree imports
 * write DBH in centimetres (4, 40, 72). A real trunk at this cap is already
 * the widest one we keep.
 */
const BARE_DIAMETER_IS_CM = MAX_TRUNK;
/** Matching girth cap: a bare circumference wider than a MAX_TRUNK circle is centimetres too. */
const BARE_GIRTH_IS_CM = MAX_TRUNK * Math.PI;
/** Every crown stays within this multiple of height, measured or derived. */
export const CROWN_PER_HEIGHT = 1.4;
/**
 * A crown thinner than half the archetype's own proportion is a needle.
 * The instance mesh is scaled by crown horizontally and height vertically.
 */
export const ARCHETYPE_CROWN_FLOOR = 0.5;

const CROWN_KEYS = ["diameter_crown", "crown_diameter", "diameter:crown"];
const CIRCUMFERENCE_KEYS = ["circumference", "circumference:breast", "trunk:circumference"];
const TRUNK_KEYS = ["diameter", "diameter_breast_height"];

/** City of Melbourne age classes, as a fraction of the mature archetype size. */
const AGE_SCALE: { test: RegExp; factor: number }[] = [
  { test: /over[-\s]?mature/, factor: 1.08 },
  { test: /semi[-\s]?mature/, factor: 0.78 },
  { test: /\bmature\b/, factor: 1 },
  { test: /juvenile/, factor: 0.55 },
  { test: /\b(new|sapling|young)\b/, factor: 0.38 },
];

export type ComMeasure = {
  /** Centimetres, as published. */
  dbh_cm: number | null;
  age: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function firstMeters(tags: Record<string, string>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = parseMeters(tags[key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

/** Mixed urban canopy. Metres of height from centimetres of trunk diameter. Not species-specific. */
export function heightFromDbhCm(dbhCm: number): number {
  return 1.35 + 3.15 * Math.pow(Math.max(dbhCm, 1), 0.42);
}

export function ageFactor(age: string | null | undefined): number | null {
  if (!age) return null;
  const text = age.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  for (const entry of AGE_SCALE) {
    if (entry.test.test(text)) return entry.factor;
  }
  return null;
}

type TrunkRead = { meters: number; centimetres: boolean };

function bareCentimetres(raw: string, metres: number, cap: number): boolean {
  return explicitLengthUnit(raw) === null && metres >= cap;
}

function readLength(raw: string | undefined, bareCap: number): TrunkRead | null {
  if (!raw) return null;
  const metres = parseMeters(raw);
  if (metres === null || metres <= 0) return null;
  const unit = explicitLengthUnit(raw);
  if (unit === "cm" || unit === "mm") return { meters: metres, centimetres: true };
  if (bareCentimetres(raw, metres, bareCap)) {
    const asCentimetres = parseLooseNumber(raw);
    if (asCentimetres === null || asCentimetres <= 0) return null;
    return { meters: asCentimetres / 100, centimetres: true };
  }
  return { meters: metres, centimetres: false };
}

function readTrunk(tags: Record<string, string>): TrunkRead | null {
  for (const key of CIRCUMFERENCE_KEYS) {
    const read = readLength(tags[key], BARE_GIRTH_IS_CM);
    if (read) return { meters: read.meters / Math.PI, centimetres: read.centimetres };
  }
  for (const key of TRUNK_KEYS) {
    const read = readLength(tags[key], BARE_DIAMETER_IS_CM);
    if (read) return read;
  }
  return null;
}

function trunkMeters(tags: Record<string, string>): number | null {
  return readTrunk(tags)?.meters ?? null;
}

/** True when a trunk tag was in centimetres: an explicit cm/mm suffix, or a bare number too wide to be metres. */
export function trunkTaggedAsCentimetres(tags: Record<string, string>): boolean {
  return readTrunk(tags)?.centimetres ?? false;
}

type PartialSize = {
  height: number | null;
  crown: number | null;
  trunk: number | null;
  crownMeasured: boolean;
  trunkMeasured: boolean;
  sizeSource: TreeSizeSource;
};

/** Shared clamp for every tier. Missing height or crown is filled from the archetype first. */
export function finishTreeSize(partial: PartialSize, archetype: string): TreeDimensions {
  const spec = archetypeSize(archetype);
  const ratio = spec.crown_diameter_m / spec.height_m;
  let height = partial.height;
  let crown = partial.crown;
  let trunk = partial.trunk;

  if (height === null && trunk !== null) height = heightFromDbhCm(trunk * 100);
  if (height === null && crown !== null) height = crown / ratio;
  if (height === null) height = spec.height_m;
  height = clamp(height, MIN_HEIGHT, MAX_HEIGHT);

  if (crown === null) crown = height * ratio;
  const floor = height * ratio * ARCHETYPE_CROWN_FLOOR;
  crown = Math.max(crown, floor);
  crown = Math.min(crown, height * CROWN_PER_HEIGHT);
  crown = clamp(crown, MIN_CROWN, MAX_CROWN);

  if (trunk === null) trunk = spec.trunk_diameter_m * (height / spec.height_m);
  if (!partial.trunkMeasured) trunk = Math.min(trunk, Math.max(MIN_TRUNK, crown * 0.28));
  trunk = clamp(trunk, MIN_TRUNK, MAX_TRUNK);

  return {
    height_m: height,
    crown_diameter_m: crown,
    trunk_diameter_m: trunk,
    sizeSource: partial.sizeSource,
  };
}

function fromCom(archetype: string, com: ComMeasure): TreeDimensions | null {
  const spec = archetypeSize(archetype);
  const factor = ageFactor(com.age);
  if (com.dbh_cm !== null && com.dbh_cm > 0) {
    const trunk = com.dbh_cm / 100;
    const height = heightFromDbhCm(com.dbh_cm);
    return finishTreeSize(
      {
        height,
        crown: height * (spec.crown_diameter_m / spec.height_m),
        trunk,
        crownMeasured: false,
        trunkMeasured: true,
        sizeSource: "com",
      },
      archetype,
    );
  }
  if (factor === null) return null;
  return finishTreeSize(
    {
      height: spec.height_m * factor,
      crown: spec.crown_diameter_m * factor,
      trunk: spec.trunk_diameter_m * Math.max(factor, 0.35),
      crownMeasured: false,
      trunkMeasured: false,
      sizeSource: "com",
    },
    archetype,
  );
}

/**
 * Height, crown, and trunk for one tree.
 * OSM measurements win, then a City of Melbourne DBH or age, then the archetype, then the generic tree.
 */
export function treeSize(tags: Record<string, string>, com?: ComMeasure | null): TreeDimensions {
  const archetype = resolveArchetype({
    genus: tags.genus,
    species: tags.species,
    taxon: tags.taxon,
    leafType: tags.leaf_type,
    leafCycle: tags.leaf_cycle,
  });
  const height = firstMeters(tags, ["height", "est_height"]);
  const crown = firstMeters(tags, CROWN_KEYS);
  const trunk = trunkMeters(tags);
  if (height !== null || crown !== null || trunk !== null) {
    return finishTreeSize(
      {
        height,
        crown,
        trunk,
        crownMeasured: crown !== null,
        trunkMeasured: trunk !== null,
        sizeSource: "osm",
      },
      archetype,
    );
  }
  if (com) {
    const sized = fromCom(archetype, com);
    if (sized) return sized;
  }
  return finishTreeSize(
    {
      height: null,
      crown: null,
      trunk: null,
      crownMeasured: false,
      trunkMeasured: false,
      sizeSource: archetype === "generic" ? "default" : "species",
    },
    archetype,
  );
}

/** True when a published number cannot be used: missing, NaN, zero, or negative. */
export function invalidPositive(value: unknown): boolean {
  return typeof value !== "number" || !Number.isFinite(value) || value <= 0;
}

export function logDroppedTreeValues(count: number, source: string) {
  if (count <= 0) return;
  const noun = count === 1 ? "value" : "values";
  console.info(
    `CityCut dropped ${count} ${source} tree ${noun} that were missing, zero, or negative.`,
  );
}

export function treeSizeCounts(trees: { sizeSource: TreeSizeSource }[]): Record<TreeSizeSource, number> {
  const counts: Record<TreeSizeSource, number> = { osm: 0, com: 0, species: 0, default: 0, vicmap: 0 };
  for (const tree of trees) counts[tree.sizeSource] += 1;
  return counts;
}

export function treeTierCounts(trees: { tier?: TreeTier }[]): Record<TreeTier, number> {
  const counts: Record<TreeTier, number> = { com: 0, osm: 0, vicmap: 0, canopy: 0 };
  for (const tree of trees) counts[tree.tier ?? "osm"] += 1;
  return counts;
}

/** Short UI line. Generic defaults are included when any tree used them. */
export function treeSizeSummary(trees: { sizeSource: TreeSizeSource }[]): string {
  const counts = treeSizeCounts(trees);
  const data = counts.osm + counts.com + counts.vicmap;
  const parts = [`${data} from data`, `${counts.species} from species defaults`];
  if (counts.default > 0) parts.push(`${counts.default} generic`);
  return `Tree sizes: ${parts.join(", ")}`;
}

export function replaceTreeNote(note: string, trees: { sizeSource: TreeSizeSource }[]): string {
  const next = describeTrees(trees);
  if (!note.includes("Trees:")) return `${note} ${next}`;
  return note
    .replace(/Trees:.*?(?=Building count was capped|Tree count was capped|$)/, `${next} `)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function describeTrees(trees: { sizeSource: TreeSizeSource; tier?: TreeTier }[]): string {
  const tiers = treeTierCounts(trees);
  return `Trees: ${treeSizeSummary(trees)} (${tiers.com} City of Melbourne, ${tiers.osm} OpenStreetMap, ${tiers.vicmap} Vicmap, ${tiers.canopy} canopy infill). City of Melbourne inventory trees use surveyed species, diameter at breast height, and age; that dataset has no crown or height field. OpenStreetMap height, est_height, crown diameter, circumference, and trunk diameter are used when present, otherwise the species archetype. Vicmap Vegetation Tree Urban fills gaps beyond 3 m using height_m and canopy diameter. Wood, forest, and scrub are filled at about 7 m. Otherwise 10 m tall and 6 m across.`;
}
