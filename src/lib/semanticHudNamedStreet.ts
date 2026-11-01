import { lateralBuildingHeights, nearestRoadAt, pointToSegmentDistanceM } from "./semanticHudGeometry";
import type { BuildingFeat, Pt, RoadFeat, TerrainField } from "../types";

export const WALK_EYE_ABOVE_GROUND_M = 1.7;
export const WALK_LATERAL_CROSS_M = 55;
export const WALK_ALONG_WINDOW_M = 55;

const PREFERRED_STREET = [/whitehorse\s*road/i, /whitehorse\s*rd/i, /station\s*street/i, /station\s*st/i];
const WALK_CAMERA_BACK_M = 6;

export type NamedStreetWalkSite = {
  at: Pt;
  roadAt: Pt;
  tangent: Pt;
  road: RoadFeat;
  groundY: number;
  leftHeightM: number;
  rightHeightM: number;
};

function roadNameScore(name: string | undefined): number {
  if (!name) return 0;
  for (let i = 0; i < PREFERRED_STREET.length; i++) {
    if (PREFERRED_STREET[i]!.test(name)) return 100 - i * 10;
  }
  return 10;
}

function insideSiteFrame(at: Pt, sideM: number, marginM: number): boolean {
  const half = sideM / 2 - marginM;
  return Math.abs(at[0]) <= half && Math.abs(at[1]) <= half;
}

function samplePointsAlongRoad(road: RoadFeat, spacingM: number): { at: Pt; tangent: Pt }[] {
  const out: { at: Pt; tangent: Pt }[] = [];
  const line = road.line;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const tangent: Pt = [dx / len, dy / len];
    const steps = Math.max(1, Math.floor(len / spacingM));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push({ at: [a[0] + dx * t, a[1] + dy * t], tangent });
    }
  }
  return out;
}

function walkCameraEastNorth(at: Pt, tangent: Pt): Pt {
  return [at[0] - tangent[0] * WALK_CAMERA_BACK_M, at[1] - tangent[1] * WALK_CAMERA_BACK_M];
}

function scoreWalkSamples(
  roads: RoadFeat[],
  buildings: BuildingFeat[],
  sideM: number,
  requireNamed: boolean,
): NamedStreetWalkSite | null {
  const marginM = Math.min(95, Math.max(55, sideM * 0.09));
  let best: { score: number; site: NamedStreetWalkSite } | null = null;
  for (const road of roads) {
    if (road.kind !== "road" || road.grade === "path" || road.service) continue;
    if (requireNamed && !road.name) continue;
    const nameScore = road.name ? roadNameScore(road.name) : 1;
    for (const sample of samplePointsAlongRoad(road, 22)) {
      const camAt = walkCameraEastNorth(sample.at, sample.tangent);
      if (!insideSiteFrame(camAt, sideM, marginM)) continue;
      const lookAt: Pt = [camAt[0] + sample.tangent[0] * 40, camAt[1] + sample.tangent[1] * 40];
      if (!insideSiteFrame(lookAt, sideM, marginM * 0.85)) continue;
      const lateral = lateralBuildingHeights(
        buildings,
        camAt,
        sample.tangent,
        WALK_LATERAL_CROSS_M,
        WALK_ALONG_WINDOW_M,
      );
      if (lateral.leftM == null || lateral.rightM == null) continue;
      if (lateral.leftM < 4 || lateral.rightM < 4) continue;
      const site: NamedStreetWalkSite = {
        at: camAt,
        roadAt: sample.at,
        tangent: sample.tangent,
        road,
        groundY: 0,
        leftHeightM: lateral.leftM,
        rightHeightM: lateral.rightM,
      };
      const score = nameScore + lateral.leftM + lateral.rightM;
      if (!best || score > best.score) best = { score, site };
    }
  }
  return best?.site ?? null;
}

export function pickNamedStreetWalkSite(
  roads: RoadFeat[],
  buildings: BuildingFeat[],
  _terrain: TerrainField | null | undefined,
  sideM: number,
): NamedStreetWalkSite | null {
  const preferredNamed = scoreWalkSamples(roads, buildings, sideM, true);
  if (preferredNamed && preferredNamed.road.name && roadNameScore(preferredNamed.road.name) >= 50) {
    return preferredNamed;
  }
  const anyNamed = scoreWalkSamples(roads, buildings, sideM, true);
  if (anyNamed) return anyNamed;
  return scoreWalkSamples(roads, buildings, sideM, false);
}

export function walkCameraFromSite(
  site: NamedStreetWalkSite,
  groundY: number,
  eyeAboveGroundM = WALK_EYE_ABOVE_GROUND_M,
) {
  const [ex, ny] = site.at;
  const [tx, ty] = site.tangent;
  const eyeY = groundY + eyeAboveGroundM;
  const lookY = groundY + 1.45;
  return {
    eye: { x: ex, y: eyeY, z: -ny },
    target: { x: ex + tx * 48, y: lookY, z: -(ny + ty * 48) },
  };
}

export function nearestNamedRoadAt(
  roads: RoadFeat[],
  at: Pt,
  maxDistanceM: number,
): { road: RoadFeat; distanceM: number; tangent: Pt } | null {
  let best: { road: RoadFeat; distanceM: number; tangent: Pt; score: number } | null = null;
  for (const road of roads) {
    if (road.kind !== "road" || !road.name || road.grade === "path" || road.service) continue;
    const line = road.line;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const distanceM = pointToSegmentDistanceM(at, a, b);
      if (distanceM > maxDistanceM) continue;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const tangent: Pt = [dx / len, dy / len];
      const score = roadNameScore(road.name) - distanceM;
      if (!best || score > best.score) best = { road, distanceM, tangent, score };
    }
  }
  if (!best) return nearestRoadAt(roads, at);
  return { road: best.road, distanceM: best.distanceM, tangent: best.tangent };
}
