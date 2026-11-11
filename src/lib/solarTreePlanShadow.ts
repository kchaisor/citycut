import type { MultiPolygon, Pair } from "polygon-clipping";
import * as polygonClipping from "polygon-clipping";
import { planShadowOffset } from "./buildingShadows";
import { openRing } from "./geo";
import { treeCrownSphereLayout } from "./treeMassing";
import { sunAtMelbourneLocal } from "./solar";
import type { PlanShadowInput } from "./buildingShadows";
import type { CityModel, Pt, Ring, TreeFeat } from "../types";

function clipLoaded(): {
  union: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon;
} {
  const loaded = polygonClipping as unknown as {
    union: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon;
    default?: { union: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon };
  };
  if (typeof loaded.union === "function") return loaded;
  if (loaded.default) return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { union } = clipLoaded();

function ellipseRing(centerEast: number, centerNorth: number, radiusM: number, segments = 14): Ring {
  const ring: Pt[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    ring.push([centerEast + Math.cos(angle) * radiusM, centerNorth + Math.sin(angle) * radiusM]);
  }
  ring.push(ring[0]!);
  return openRing(ring);
}

function ringToMulti(ring: Ring): MultiPolygon {
  const pairs: Pair[] = ring.map((point) => [point[0], point[1]]);
  const first = pairs[0]!;
  const last = pairs[pairs.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) pairs.push([first[0], first[1]]);
  return [[pairs]];
}

export function treeCrownShadowRing(tree: TreeFeat, input: PlanShadowInput): Ring | null {
  const sample = sunAtMelbourneLocal(
    input.lat,
    input.lon,
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
  );
  if (!sample.aboveHorizon) return null;
  const layout = treeCrownSphereLayout(tree.height_m, tree.crown_diameter_m);
  const offset = planShadowOffset(sample, layout.centerY);
  if (!offset) return null;
  const [east, north] = tree.at;
  const stretch = 1 + Math.min(2.2, Math.hypot(offset[0], offset[1]) / Math.max(layout.radiusX, 2));
  const radiusM = layout.radiusX * stretch;
  return ellipseRing(east + offset[0], north + offset[1], Math.max(0.8, radiusM));
}

export function planTreeShadowMulti(model: CityModel, input: PlanShadowInput, trees: readonly TreeFeat[]): MultiPolygon {
  if (trees.length === 0) return [];
  let merged: MultiPolygon = [];
  for (const tree of trees) {
    const ring = treeCrownShadowRing(tree, input);
    if (!ring) continue;
    const multi = ringToMulti(ring);
    if (multi.length === 0) continue;
    try {
      merged = merged.length === 0 ? multi : union(merged, multi);
    } catch {
      continue;
    }
  }
  if (merged.length === 0) return [];
  const frameHalf = model.sideM / 2;
  const frame: MultiPolygon = [
    [
      [
        [-frameHalf, -frameHalf],
        [frameHalf, -frameHalf],
        [frameHalf, frameHalf],
        [-frameHalf, frameHalf],
        [-frameHalf, -frameHalf],
      ],
    ],
  ];
  try {
    return polygonClipping.intersection(merged, frame) as MultiPolygon;
  } catch {
    return merged;
  }
}
