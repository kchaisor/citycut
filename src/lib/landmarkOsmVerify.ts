import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openRing, signedArea, toLocal } from "./geo";
import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, LonLat, Ring } from "../types";
import { landmarkHeightAtPoint } from "./landmarkBuildingPick";
import type { LandmarkRow } from "./landmarkHeights.test";

export type OsmWayFixture = {
  id: number;
  version: number | null;
  tags: Record<string, string>;
  ringLonLat: [number, number][];
};

export type LandmarkOsmWaysFile = {
  ways: Record<string, OsmWayFixture>;
};

export function loadLandmarkOsmWays(): LandmarkOsmWaysFile {
  const path = fileURLToPath(new URL("./fixtures/landmark-osm-ways.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as LandmarkOsmWaysFile;
}

export function osmWayRingLocal(way: OsmWayFixture, center: LonLat): Ring {
  return way.ringLonLat.map(([lon, lat]) => toLocal(lat, lon, center));
}

export function osmTagValue(way: OsmWayFixture, tag: string): string | null {
  if (tag === "name") return way.tags.name?.trim() ?? null;
  if (tag === "addr:housenumber+addr:street") {
    const num = way.tags["addr:housenumber"];
    const street = way.tags["addr:street"];
    if (num && street) return `${num} ${street}`.trim();
    return null;
  }
  return way.tags[tag]?.trim() ?? null;
}

export function wayCoverageByBuilding(building: BuildingFeat, wayRing: Ring): number {
  const wayArea = Math.abs(signedArea(openRing(wayRing)));
  if (wayArea <= 0) return 0;
  const fp = {
    id: "way",
    ring: wayRing,
    holes: [] as Ring[],
    height_m: 0,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  };
  const overlap = intersectionAreaM2(building, fp);
  return overlap / wayArea;
}

/** Prefer the containing footprint that best covers the fixture OSM way polygon. */
export function pickLandmarkBuildingAtPoint(
  buildings: BuildingFeat[],
  lm: LandmarkRow,
  center: LonLat,
  waysFile: LandmarkOsmWaysFile,
): { building: BuildingFeat; heightM: number; coverage: number } | null {
  const way = waysFile.ways[String(lm.osm.id)];
  if (!way) return null;
  const ring = osmWayRingLocal(way, center);
  const at = toLocal(lm.lat, lm.lon, center);
  const containing = buildings.filter((building) => pointInPolygon(at, building.ring, building.holes));
  if (containing.length === 0) return null;
  let best: BuildingFeat | null = null;
  let bestCoverage = -1;
  for (const building of containing) {
    const coverage = wayCoverageByBuilding(building, ring);
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      best = building;
    }
  }
  if (!best) return null;
  return {
    building: best,
    heightM: landmarkHeightAtPoint(best, at),
    coverage: bestCoverage,
  };
}

export function assertLandmarkOsmGeometry(
  lm: LandmarkRow,
  building: BuildingFeat,
  center: LonLat,
  waysFile: LandmarkOsmWaysFile,
  minCoverage = 0.9,
): string | null {
  const way = waysFile.ways[String(lm.osm.id)];
  if (!way) return `${lm.name}: missing OSM way ${lm.osm.id} in landmark-osm-ways.json`;
  const ring = osmWayRingLocal(way, center);
  const at = toLocal(lm.lat, lm.lon, center);
  if (!pointInPolygon(at, ring, [])) {
    return `${lm.name}: fixture point outside OSM way ${lm.osm.id} polygon`;
  }
  const coverage = wayCoverageByBuilding(building, ring);
  if (coverage < minCoverage) {
    return `${lm.name}: building covers ${(coverage * 100).toFixed(1)}% of OSM way ${lm.osm.id} (need ≥${minCoverage * 100}%)`;
  }
  const tagValue = osmTagValue(way, lm.osm.tag);
  if (tagValue && tagValue.localeCompare(lm.osm.value, undefined, { sensitivity: "accent" }) !== 0) {
    return `${lm.name}: OSM tag ${lm.osm.tag}="${tagValue}" != fixture "${lm.osm.value}"`;
  }
  if (!tagValue && lm.osm.tag === "name") {
    return `${lm.name}: OSM way ${lm.osm.id} missing name tag (expected "${lm.osm.value}")`;
  }
  return null;
}
