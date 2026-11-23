import { fitOrthoZoom, type Aabb, type Vec3 } from "./isoCamera";

export const EXPLODE_LAYERS = ["ground", "transport", "buildings", "trees"] as const;

export type ExplodeLayerId = (typeof EXPLODE_LAYERS)[number];

export const EXPLODE_LAYER_LABELS: Record<ExplodeLayerId, string> = {
  ground: "Ground",
  transport: "Roads & transport",
  buildings: "Buildings",
  trees: "Trees",
};

export type ExplodeLayerBoxes = Record<ExplodeLayerId, Aabb | null>;

export type ExplodeLayerOffsets = Record<ExplodeLayerId, number>;

export const EXPLODE_DURATION_MS = 900;
export const EXPLODE_GAP_STEP_M = 5;
export const EXPLODE_GAP_MIN_M = 10;
export const EXPLODE_GAP_DEFAULT_RATIO = 0.15;
export const EXPLODE_GAP_MAX_RATIO = 0.6;
export const EXPLODE_LABEL_ROOM_PX = 136;
export const EXPLODE_LABEL_FADE_START = 0.7;

const TRANSPORT_NAMES = new Set(["Roads", "RailLines", "TramLines"]);
const BUILDING_NAMES = new Set(["Buildings", "Buildings-manual", "Buildings-site", "BuildingEdges", "RoofLines", "HeightEditOverlay"]);

export function explodeLayerOfObjectName(name: string): ExplodeLayerId {
  if (name === "Trees") return "trees";
  if (TRANSPORT_NAMES.has(name)) return "transport";
  if (BUILDING_NAMES.has(name) || name.startsWith("Buildings::") || name.startsWith("source:")) return "buildings";
  return "ground";
}

export function explodeLayerOfSelectionKind(kind: string | null | undefined): ExplodeLayerId {
  if (kind === "building" || kind === "imported") return "buildings";
  if (kind === "tree") return "trees";
  return "ground";
}

export function noExplodeOffsets(): ExplodeLayerOffsets {
  return { ground: 0, transport: 0, buildings: 0, trees: 0 };
}

export function noExplodeBoxes(): ExplodeLayerBoxes {
  return { ground: null, transport: null, buildings: null, trees: null };
}

export function easeInOutCubic(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function stepExplodeClock(clock: number, target: 0 | 1, deltaMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return target;
  const step = Math.max(0, deltaMs) / EXPLODE_DURATION_MS;
  return target === 1 ? Math.min(1, clock + step) : Math.max(0, clock - step);
}

export function layerOffsets(thicknesses: readonly number[], gapM: number, progress: number): number[] {
  const p = Math.min(1, Math.max(0, progress));
  const offsets: number[] = [];
  for (let index = 0; index < thicknesses.length; index++) {
    offsets.push(index === 0 ? 0 : offsets[index - 1] + (Math.max(0, thicknesses[index - 1]) + Math.max(0, gapM)) * p);
  }
  return offsets;
}

export function explodeOffsets(boxes: ExplodeLayerBoxes, gapM: number, progress: number): ExplodeLayerOffsets {
  const present = EXPLODE_LAYERS.filter((layer) => boxes[layer] != null);
  const overlaps = present.map((layer, index) => {
    const next = present[index + 1];
    return next ? Math.max(0, boxes[layer]!.max[1] - boxes[next]!.min[1]) : 0;
  });
  const stacked = layerOffsets(overlaps, gapM, progress);
  const offsets = noExplodeOffsets();
  let carried = 0;
  for (const layer of EXPLODE_LAYERS) {
    const index = present.indexOf(layer);
    if (index >= 0) carried = stacked[index];
    offsets[layer] = carried;
  }
  return offsets;
}

export function liftedBox(box: Aabb, offsetY: number): Aabb {
  return {
    min: [box.min[0], box.min[1] + offsetY, box.min[2]],
    max: [box.max[0], box.max[1] + offsetY, box.max[2]],
  };
}

export function explodedBounds(base: Aabb | null, boxes: ExplodeLayerBoxes, offsets: ExplodeLayerOffsets): Aabb | null {
  let bounds: Aabb | null = base ? { min: [...base.min], max: [...base.max] } : null;
  for (const layer of EXPLODE_LAYERS) {
    const box = boxes[layer];
    if (!box) continue;
    const lifted = liftedBox(box, offsets[layer]);
    if (!bounds) {
      bounds = lifted;
      continue;
    }
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], lifted.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], lifted.max[axis]);
    }
  }
  return bounds;
}

export function explodeFitZoom(
  bounds: Aabb,
  offsetFromCentre: Vec3,
  viewWidth: number,
  viewHeight: number,
  progress: number,
): number {
  const room = EXPLODE_LABEL_ROOM_PX * Math.min(1, Math.max(0, progress));
  const width = Math.max(viewWidth * 0.5, viewWidth - 2 * room);
  return fitOrthoZoom(bounds, offsetFromCentre, width, viewHeight);
}

export function layerLabelAnchor(box: Aabb, offsetY: number, screenRight: Vec3): Vec3 {
  const x = screenRight[0] > 0 ? box.min[0] : box.max[0];
  const z = screenRight[2] > 0 ? box.min[2] : box.max[2];
  return [x, box.min[1] + offsetY, z];
}

export function explodeLabelOpacity(progress: number, exploding: boolean): number {
  if (!exploding) return 0;
  return Math.min(1, Math.max(0, (progress - EXPLODE_LABEL_FADE_START) / (1 - EXPLODE_LABEL_FADE_START)));
}

export type ExplodeGapRange = { minM: number; maxM: number; stepM: number; defaultM: number };

function toGapStep(value: number): number {
  return Math.round(value / EXPLODE_GAP_STEP_M) * EXPLODE_GAP_STEP_M;
}

export function explodeGapRange(cutSideM: number): ExplodeGapRange {
  const side = Math.max(0, cutSideM);
  const maxM = Math.max(EXPLODE_GAP_MIN_M + EXPLODE_GAP_STEP_M, toGapStep(side * EXPLODE_GAP_MAX_RATIO));
  const defaultM = Math.min(maxM, Math.max(EXPLODE_GAP_MIN_M, toGapStep(side * EXPLODE_GAP_DEFAULT_RATIO)));
  return { minM: EXPLODE_GAP_MIN_M, maxM, stepM: EXPLODE_GAP_STEP_M, defaultM };
}

export function resolveExplodeGapM(range: ExplodeGapRange, chosenM: number | null): number {
  if (chosenM == null || !Number.isFinite(chosenM)) return range.defaultM;
  return Math.min(range.maxM, Math.max(range.minM, toGapStep(chosenM)));
}

export function explodeGapShare(range: ExplodeGapRange, gapM: number): number {
  return Math.min(1, Math.max(0, (gapM - range.minM) / Math.max(range.maxM - range.minM, 1e-6)));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
