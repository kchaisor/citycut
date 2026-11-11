import type { CityModel, Pt } from "../../types";
import { poseFromNorthClockwiseDeg, presetNorthClockwiseDeg } from "./angleNorth";
import type { SectionKnifePose } from "./plane";
import { knifeNormalXZ } from "./plane";

export type SnapEdgeKind = "road" | "parcel" | "rail" | "tram";

export type SnapEdge = {
  kind: SnapEdgeKind;
  aEast: number;
  aNorth: number;
  bEast: number;
  bNorth: number;
};

export type SnapCue = {
  kind: SnapEdgeKind;
  east: number;
  north: number;
  angleDeg: number;
};

function openPolyline(line: Pt[]): Pt[] {
  if (line.length < 2) return line;
  const first = line[0]!;
  const last = line[line.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return line.slice(0, -1);
  return line;
}

export function collectSnapEdges(model: CityModel): SnapEdge[] {
  const out: SnapEdge[] = [];
  for (const road of model.roads) {
    if (road.line.length < 2) continue;
    const kind = road.kind === "rail" ? "rail" : "road";
    const pts = openPolyline(road.line);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      out.push({ kind, aEast: a[0], aNorth: a[1], bEast: b[0], bNorth: b[1] });
    }
  }
  for (const line of model.tramLines ?? []) {
    const pts = openPolyline(line);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      out.push({ kind: "tram", aEast: a[0], aNorth: a[1], bEast: b[0], bNorth: b[1] });
    }
  }
  for (const ring of model.siteBoundaryLines ?? []) {
    const pts = openPolyline(ring);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      out.push({ kind: "parcel", aEast: a[0], aNorth: a[1], bEast: b[0], bNorth: b[1] });
    }
  }
  return out;
}

export function nearestPointOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): { east: number; north: number; t: number; distance: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    const d = Math.hypot(px - ax, py - ay);
    return { east: ax, north: ay, t: 0, distance: d };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const east = ax + dx * t;
  const north = ay + dy * t;
  return { east, north, t, distance: Math.hypot(px - east, py - north) };
}

export function nearestSnapEdge(
  edges: SnapEdge[],
  east: number,
  north: number,
): { edge: SnapEdge; east: number; north: number; distance: number } | null {
  let best: { edge: SnapEdge; east: number; north: number; distance: number } | null = null;
  for (const edge of edges) {
    const hit = nearestPointOnSegment(edge.aEast, edge.aNorth, edge.bEast, edge.bNorth, east, north);
    if (!best || hit.distance < best.distance) {
      best = { edge, east: hit.east, north: hit.north, distance: hit.distance };
    }
  }
  return best;
}

export function tangentFromEdge(edge: SnapEdge): { east: number; north: number } {
  const dx = edge.bEast - edge.aEast;
  const dy = edge.bNorth - edge.aNorth;
  const len = Math.hypot(dx, dy) || 1;
  return { east: dx / len, north: dy / len };
}

export function poseFromEdgePoint(edge: SnapEdge, east: number, north: number): SectionKnifePose {
  const tan = tangentFromEdge(edge);
  const angleRad = Math.atan2(-tan.east, -tan.north);
  const normal = knifeNormalXZ({ angleRad, offsetM: 0 });
  const offsetM = normal.x * east + normal.z * -north;
  return { angleRad, offsetM };
}

export function snapPoseToModel(
  model: CityModel,
  pose: SectionKnifePose,
  maxDistanceM = 28,
): { pose: SectionKnifePose; cue: SnapCue | null } {
  const edges = collectSnapEdges(model);
  if (edges.length === 0) return { pose, cue: null };
  const normal = knifeNormalXZ(pose);
  const originEast = normal.x * pose.offsetM;
  const originNorth = -normal.z * pose.offsetM;
  const hit = nearestSnapEdge(edges, originEast, originNorth);
  if (!hit || hit.distance > maxDistanceM) return { pose, cue: null };
  const next = poseFromEdgePoint(hit.edge, hit.east, hit.north);
  const tangent = tangentFromEdge(hit.edge);
  const tangentDeg =
    ((Math.atan2(tangent.east, -tangent.north) * 180) / Math.PI + 360) % 360;
  return {
    pose: next,
    cue: { kind: hit.edge.kind, east: hit.east, north: hit.north, angleDeg: Math.round(tangentDeg) },
  };
}

export function snapPoseToPreset(pose: SectionKnifePose, preset: 0 | 45 | 90): SectionKnifePose {
  const deg = presetNorthClockwiseDeg(preset);
  return poseFromNorthClockwiseDeg(deg, pose.offsetM);
}
