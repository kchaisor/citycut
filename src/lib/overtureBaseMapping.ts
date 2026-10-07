import { isOpenWaterArea } from "./waterAreas";
import { signedArea } from "./geo";
import type { Ring } from "../types";
import type { CanopyKind } from "./parseOsm";

export function parseSourceTags(raw: unknown): Record<string, string> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Map Overture base water class/subtype (+ OSM source_tags) to tags for PR #35 water rules. */
export function waterTagsFromOverture(props: Record<string, unknown>): Record<string, string> {
  const tags = parseSourceTags(props.source_tags);
  const className = String(props.class ?? "").toLowerCase();
  const subtype = String(props.subtype ?? "").toLowerCase();
  if (tags.waterway) return tags;
  if (tags.natural === "water" || tags.landuse === "reservoir") return tags;
  if (className === "river" || subtype === "river") {
    return { ...tags, waterway: tags.waterway ?? "river", natural: "water", water: tags.water ?? "river" };
  }
  if (className === "canal" || subtype === "canal") {
    return { ...tags, waterway: "canal", natural: "water", water: "canal" };
  }
  if (className === "lake" || subtype === "lake") {
    return { ...tags, natural: "water", water: "lake" };
  }
  if (className === "reservoir" || subtype === "reservoir" || tags.landuse === "reservoir") {
    return { ...tags, landuse: "reservoir", natural: "water", water: "reservoir" };
  }
  if (className === "pond" || subtype === "pond") {
    return { ...tags, natural: "water", water: "pond" };
  }
  if (className === "harbour" || subtype === "harbour") {
    return { ...tags, natural: "water", water: "harbour" };
  }
  if (className === "lagoon" || subtype === "lagoon") {
    return { ...tags, natural: "water", water: "lagoon" };
  }
  if (className === "dock" || subtype === "dock") {
    return { ...tags, waterway: "dock", natural: "water" };
  }
  if (subtype === "physical" || className === "physical") {
    return { ...tags, natural: "water" };
  }
  return tags;
}

export function isOvertureWaterPolygon(props: Record<string, unknown>, ring: Ring): boolean {
  const tags = waterTagsFromOverture(props);
  const areaM2 = Math.abs(signedArea(ring));
  return isOpenWaterArea(tags, areaM2);
}

export function isOvertureWaterLine(props: Record<string, unknown>): boolean {
  const className = String(props.class ?? "").toLowerCase();
  const subtype = String(props.subtype ?? "").toLowerCase();
  if (["river", "canal", "stream", "dock", "drain"].includes(className)) return className !== "drain";
  if (["river", "canal", "stream", "dock"].includes(subtype)) return true;
  const tags = parseSourceTags(props.source_tags);
  const waterway = tags.waterway?.split(";")[0];
  if (waterway && ["river", "canal", "dock", "stream", "riverbank"].includes(waterway)) return true;
  return false;
}

export function waterLineHalfWidthM(props: Record<string, unknown>): number {
  const className = String(props.class ?? "").toLowerCase();
  const subtype = String(props.subtype ?? "").toLowerCase();
  if (className === "river" || subtype === "river") return 6;
  if (className === "canal" || subtype === "canal") return 4;
  if (className === "stream" || subtype === "stream") return 4;
  if (className === "dock" || subtype === "dock") return 3;
  return 4;
}

export function greenTagsFromLandUse(props: Record<string, unknown>): Record<string, string> | null {
  const fromSource = parseSourceTags(props.source_tags);
  if (fromSource.leisure || fromSource.landuse || fromSource.natural) return fromSource;
  const className = String(props.class ?? "").toLowerCase();
  if (className === "grass") return { landuse: "grass" };
  if (className === "forest") return { landuse: "forest" };
  if (className === "meadow") return { landuse: "meadow" };
  if (className === "cemetery") return { landuse: "cemetery" };
  if (className === "recreation_ground") return { landuse: "recreation_ground" };
  if (className === "village_green") return { landuse: "village_green" };
  if (className === "park") return { leisure: "park" };
  if (className === "garden") return { leisure: "garden" };
  if (className === "nature_reserve") return { leisure: "nature_reserve" };
  if (className === "pitch") return { leisure: "pitch" };
  return null;
}

export function isGreenLandUse(props: Record<string, unknown>): boolean {
  const tags = greenTagsFromLandUse(props);
  if (!tags) return false;
  return (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "nature_reserve" ||
    tags.leisure === "pitch" ||
    tags.landuse === "forest" ||
    tags.landuse === "grass" ||
    tags.landuse === "meadow" ||
    tags.landuse === "recreation_ground" ||
    tags.landuse === "village_green" ||
    tags.landuse === "cemetery" ||
    tags.natural === "wood" ||
    tags.natural === "scrub" ||
    tags.natural === "wetland"
  );
}

export function canopyKindFromLandCover(subtype: string): CanopyKind | null {
  const value = subtype.toLowerCase();
  if (value === "scrub") return "scrub";
  if (value === "forest" || value === "tree") return "forest";
  if (value === "wood") return "wood";
  return null;
}

export function treeTagsFromLand(props: Record<string, unknown>): Record<string, string> {
  return parseSourceTags(props.source_tags);
}
