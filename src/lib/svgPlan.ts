import { BUILDING_USE_META } from "./buildingUse";
import { clipPolygon, clipPolyline } from "./clip";
import { openRing } from "./geo";
import { carriagewaysOf, unionCarriageways } from "./roadFill";
import { contourInterval, contourLines } from "./terrain";
import type { CityModel, Pt } from "../types";

const round = (value: number) => Math.round(value * 10) / 10;

export function svgPolyline(points: Pt[], close: boolean): string {
  if (points.length < 2) return "";
  const body = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point[0])} ${round(-point[1])}`)
    .join(" ");
  return close ? `${body} Z` : body;
}

export function svgRings(rings: Pt[][]): string {
  return rings
    .map((ring) => svgPolyline(openRing(ring), true))
    .filter(Boolean)
    .join(" ");
}

export type PlanPaths = {
  green: Pt[][][];
  water: Pt[][][];
  /** Unioned carriageway, outer rings plus block holes, in local east/north metres. */
  roadFill: Pt[][][];
  /** Buffer and union time for the carriageway, in milliseconds. */
  roadUnionMs: number;
  paths: Pt[][];
  rails: Pt[][];
  buildings: { rings: Pt[][]; fill: string }[];
  trees: { east: number; north: number; r: number }[];
  contours: Pt[][];
  contourInterval: number | null;
};

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
  }
  return out;
}

function leftNormal(dir: Pt): Pt {
  return [-dir[1], dir[0]];
}

function direction(a: Pt, b: Pt): Pt | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return [dx / length, dy / length];
}

/** Open polyline offset to the left of its direction. A negative distance offsets to the right. */
export function offsetPolyline(line: Pt[], distance: number): Pt[] {
  const pts = dedupe(line);
  if (pts.length < 2) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const incoming = i > 0 ? direction(pts[i - 1], pts[i]) : null;
    const outgoing = i < pts.length - 1 ? direction(pts[i], pts[i + 1]) : null;
    const n1 = incoming ? leftNormal(incoming) : null;
    const n2 = outgoing ? leftNormal(outgoing) : null;
    let nx = 0;
    let ny = 0;
    let scale = 1;
    if (n1 && n2) {
      nx = n1[0] + n2[0];
      ny = n1[1] + n2[1];
      const length = Math.hypot(nx, ny);
      if (length < 0.25) {
        nx = n1[0];
        ny = n1[1];
      } else {
        nx /= length;
        ny /= length;
        const dot = n1[0] * nx + n1[1] * ny;
        scale = dot > 0.35 ? Math.min(2.2, 1 / dot) : 1;
      }
    } else {
      const normal = n2 ?? n1;
      if (!normal) continue;
      nx = normal[0];
      ny = normal[1];
    }
    out.push([pts[i][0] + nx * distance * scale, pts[i][1] + ny * distance * scale]);
  }
  return out;
}

function clipRings(outer: Pt[], holes: Pt[][], half: number): Pt[][] | null {
  const ring = clipPolygon(outer, -half, half);
  if (ring.length < 3) return null;
  const inners = holes
    .map((hole) => clipPolygon(hole, -half, half))
    .filter((hole) => hole.length >= 3);
  return [ring, ...inners];
}

function clipLines(line: Pt[], half: number): Pt[][] {
  return clipPolyline(dedupe(line), -half, half).map(dedupe).filter((part) => part.length >= 2);
}

export function planPaths(model: CityModel): PlanPaths {
  const half = model.sideM / 2;
  const green: Pt[][][] = [];
  const water: Pt[][][] = [];
  for (const area of model.areas) {
    const rings = clipRings(area.ring, area.holes, half);
    if (!rings) continue;
    if (area.kind === "water") water.push(rings);
    else green.push(rings);
  }

  const paths: PlanPaths["paths"] = [];
  const rails: PlanPaths["rails"] = [];
  for (const road of model.roads) {
    if (road.kind === "rail") {
      for (const line of clipLines(road.line, half)) rails.push(line);
      continue;
    }
    if (road.grade === "path") {
      for (const line of clipLines(road.line, half)) paths.push(line);
    }
  }
  const carriageway = unionCarriageways(carriagewaysOf(model.roads), model.sideM);

  const buildings = model.buildings
    .map((building) => {
      const rings = clipRings(building.ring, building.holes, half);
      if (!rings) return null;
      return { rings, fill: BUILDING_USE_META[building.use].color };
    })
    .filter((building): building is { rings: Pt[][]; fill: string } => building !== null);

  const trees = model.trees
    .filter((tree) => Math.abs(tree.at[0]) <= half && Math.abs(tree.at[1]) <= half)
    .map((tree) => ({
      east: tree.at[0],
      north: tree.at[1],
      r: tree.crown_diameter_m / 2,
    }));

  const interval = model.terrain && model.contours ? contourInterval(model.terrain.max - model.terrain.min) : null;
  const contours =
    model.terrain && interval
      ? contourLines(model.terrain, model.sideM, interval).flatMap((line) => clipLines(line, half))
      : [];

  return {
    green,
    water,
    roadFill: carriageway.polygons,
    roadUnionMs: carriageway.ms,
    paths,
    rails,
    buildings,
    trees,
    contours,
    contourInterval: contours.length > 0 ? interval : null,
  };
}
