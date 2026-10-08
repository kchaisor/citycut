import type { RoadGrade } from "../types";

const SKIP_HIGHWAY = new Set([
  "proposed",
  "construction",
  "abandoned",
  "platform",
  "bus_stop",
  "elevator",
  "corridor",
  "raceway",
  "rest_area",
  "services",
  "no",
  "via_ferrata",
  "escalator",
  "escape",
  "bus_guideway",
]);

const ARTERIAL = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

export const NON_VEHICULAR_HIGHWAY = new Set([
  "footway",
  "path",
  "cycleway",
  "steps",
  "pedestrian",
  "bridleway",
  "track",
]);

const PATH = NON_VEHICULAR_HIGHWAY;

export const ROAD_WIDTH: Record<string, number> = {
  motorway: 16,
  trunk: 14,
  primary: 12,
  secondary: 9,
  tertiary: 7.5,
  residential: 5.5,
  unclassified: 5,
  living_street: 4.5,
  service: 3.2,
  pedestrian: 6,
  footway: 1.8,
  path: 1.6,
  cycleway: 2.2,
  track: 3,
  steps: 1.4,
  bridleway: 1.8,
  motorway_link: 8,
  trunk_link: 7,
  primary_link: 6.5,
  secondary_link: 5.5,
  tertiary_link: 4.5,
};

export function roadGrade(highway: string): RoadGrade {
  const base = highway.split(";")[0];
  if (PATH.has(base)) return "path";
  if (ARTERIAL.has(base)) return "arterial";
  return "local";
}

export function roadWidthFromHighway(highway: string): number {
  const base = highway.split(";")[0];
  if (SKIP_HIGHWAY.has(base)) return 0;
  return ROAD_WIDTH[base] ?? 4.2;
}

export function roadWidthFromRail(className: string): number {
  if (className === "tram") return 2.8;
  return 3.6;
}

export type RoadSpec = { width: number; kind: "road" | "rail"; grade?: RoadGrade; highway?: string };

export function roadSpecFromHighway(highway: string): RoadSpec | null {
  const base = highway.split(";")[0];
  const width = roadWidthFromHighway(base);
  if (width <= 0) return null;
  return { width, kind: "road", grade: roadGrade(base), highway: base };
}

export function roadSpecFromRailway(railClass: string): RoadSpec | null {
  if (!["rail", "light_rail", "tram", "subway", "narrow_gauge", "standard_gauge", "monorail", "funicular"].includes(railClass)) {
    return null;
  }
  const mapped = railClass === "standard_gauge" ? "rail" : railClass === "monorail" ? "rail" : railClass;
  return { width: roadWidthFromRail(mapped), kind: "rail" };
}
