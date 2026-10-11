import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { annotateUnresolvedZoneDefaults } from "./buildingHeightResolve";
import { applyComBuildingHeights, intersectionAreaM2, ringBBox } from "./comBuildingHeightsMatch";
import { openRing, signedArea } from "./geo";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import { applyDevelopmentFloorsToBuildings, type DamFloorRecord } from "./comDevelopmentFloors";
import type { BuildingExtrusionPart, BuildingFeat, LonLat, Ring } from "../types";

/**
 * Everything after CoM matching, in tier order (see buildingHeightResolve.ts): DAM floors on
 * buildings CoM did not measure, then the source-of-truth pass that labels every remaining
 * default as an estimate. Pass the CoM-matched list, or the pre-CoM list with no footprints
 * while CoM is loading or after it failed (the next source then applies, still labelled).
 */
export function resolveBuildingHeightsAfterCom(
  afterCom: BuildingFeat[],
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
): BuildingFeat[] {
  const withDam = applyDevelopmentFloorsToBuildings(afterCom, center, damRecords);
  const annotated = annotateUnresolvedZoneDefaults(withDam, center, footprints, damRecords);
  return carveNestedBuildings(annotated);
}

type ClipFns = { difference: (a: Polygon | MultiPolygon, ...b: Array<Polygon | MultiPolygon>) => MultiPolygon };
const clip = ((polygonClipping as unknown as { default?: ClipFns }).default ??
  (polygonClipping as unknown as ClipFns)) as ClipFns;

function closed(ring: Ring): [number, number][] {
  const pts = ring.map(([x, y]) => [x, y] as [number, number]);
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  if (pts.length >= 3 && Math.hypot(ax - bx, ay - by) > 1e-9) pts.push([ax, ay]);
  return pts;
}

function netArea(ring: Ring, holes: Ring[]): number {
  let area = Math.abs(signedArea(openRing(ring)));
  for (const hole of holes) area -= Math.abs(signedArea(openRing(hole)));
  return Math.max(0, area);
}

/** Share of the smaller footprint that must sit inside the larger one to count as nested. */
export const NESTED_BUILDING_SHARE = 0.5;
const MIN_PART_M2 = 2;

function partsOf(building: BuildingFeat): BuildingExtrusionPart[] {
  return building.extrusionParts?.length
    ? building.extrusionParts
    : [{ ring: building.ring, holes: building.holes, height: building.height }];
}

function asPolygon(shape: { ring: Ring; holes: Ring[] }): Polygon {
  return [closed(shape.ring), ...shape.holes.map(closed)];
}

/** Tallest part top (base + height) that covers more than 1 m² of `region`. */
function tallestOver(building: BuildingFeat, region: { ring: Ring; holes: Ring[] }): number {
  let best = -Infinity;
  for (const part of partsOf(building)) {
    if (intersectionAreaM2(part, region) > 1) best = Math.max(best, (part.base ?? 0) + part.height);
  }
  return best;
}

function subtractFootprints(parts: BuildingExtrusionPart[], cutters: Polygon[]): BuildingExtrusionPart[] {
  const next: BuildingExtrusionPart[] = [];
  for (const part of parts) {
    const rest = clip.difference(asPolygon(part), ...cutters);
    for (const poly of rest) {
      if (!poly[0]?.length) continue;
      const ring = openRing(poly[0] as Ring);
      const holes = poly.slice(1).map((hole) => openRing(hole as Ring));
      if (netArea(ring, holes) < MIN_PART_M2) continue;
      next.push({ ...part, ring, holes });
    }
  }
  return next;
}

/**
 * Overture sometimes keeps one building outline inside another (a shop or tower outline inside
 * a block outline). Every footprint is extruded from the ground, and each gets its own CoM clip,
 * so the shared area was drawn twice: identical, coincident masses. When at least
 * {@link NESTED_BUILDING_SHARE} of a smaller footprint lies inside a larger one, the shared area
 * is drawn once, by whichever building is taller there (ties keep the larger, usually the OSM
 * outline): the other one's 3D parts lose that area. A nested footprint left with no area of its
 * own gets {@link BuildingFeat.meshDrawnBy}. Outlines, uses, ids and scalar heights are unchanged,
 * so the panel, site plan and exports keep the same building set and heights; only 3D parts
 * change. Edge slivers between neighbours are left alone.
 */
export function carveNestedBuildings(buildings: BuildingFeat[]): BuildingFeat[] {
  const boxes = buildings.map((b) => ringBBox(b.ring));
  const areas = buildings.map((b) => netArea(b.ring, b.holes));
  const cutBy = new Map<number, number[]>();
  const hiddenBy = new Map<number, number>();
  const add = (target: number, cutter: number) => {
    const list = cutBy.get(target) ?? [];
    list.push(cutter);
    cutBy.set(target, list);
  };
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (b.minX > a.maxX || b.maxX < a.minX || b.minY > a.maxY || b.maxY < a.minY) continue;
      const [big, small] = areas[i] >= areas[j] ? [i, j] : [j, i];
      if (!(areas[small] > 0) || buildings[big].heightManual || buildings[small].heightManual) continue;
      const overlap = intersectionAreaM2(buildings[big], buildings[small]);
      if (overlap < NESTED_BUILDING_SHARE * areas[small]) continue;
      const smallTop = tallestOver(buildings[small], buildings[small]);
      const bigTop = tallestOver(buildings[big], buildings[small]);
      if (smallTop > bigTop + 0.05) add(big, small);
      else {
        add(small, big);
        hiddenBy.set(small, big);
      }
    }
  }
  if (cutBy.size === 0) return buildings;
  return buildings.map((building, index) => {
    const cutters = cutBy.get(index);
    if (!cutters) return building;
    let next: BuildingExtrusionPart[];
    try {
      next = subtractFootprints(
        partsOf(building),
        cutters.map((k) => asPolygon(buildings[k])),
      );
    } catch {
      return building;
    }
    if (next.length === 0) {
      const container = hiddenBy.get(index);
      return container == null ? building : { ...building, meshDrawnBy: buildings[container].id };
    }
    return { ...building, extrusionParts: next };
  });
}

/** Full height resolution from the pre-CoM list (Overture + enrichment + LiDAR). */
export function resolveBuildingHeights(
  beforeCom: BuildingFeat[],
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
): BuildingFeat[] {
  const { buildings: withCom } = applyComBuildingHeights(beforeCom, footprints);
  return resolveBuildingHeightsAfterCom(withCom, center, footprints, damRecords);
}
