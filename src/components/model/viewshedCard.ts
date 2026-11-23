import type { WalkViewshed } from "../useWalkViewshed";

export const VIEWSHED_EYE_PRESETS_M = [1.6, 4.5, 10] as const;
export const VIEWSHED_EYE_MATCH_M = 0.15;
export const VIEWSHED_RADIUS_PRESETS_M = [100, 200, 400] as const;

export function viewshedCardMeta(eyeM: number, radiusM: number): string {
  return `${eyeM.toFixed(1)} m · ${radiusM} m`;
}

export function viewshedHint(walk: Pick<WalkViewshed, "drawing" | "clickCount" | "sampleCount" | "lengthM">): string {
  if (walk.drawing) return "Click the ground in the 3D view to place walk points.";
  if (walk.clickCount > 0) return `Walk path · ${Math.round(walk.lengthM)} m (${walk.sampleCount} samples). Compute to see the view.`;
  return "Draw a path on the ground, then compute what a person walking it would see.";
}

export function viewshedComputeLabel(walk: Pick<WalkViewshed, "status" | "progress">): string {
  if (walk.status === "computing") return `Computing ${Math.round(walk.progress * 100)}%`;
  return walk.status === "ready" ? "Computed" : "Compute";
}

export function viewshedReadout(
  walk: Pick<WalkViewshed, "sampleCount" | "lengthM" | "eyeM" | "radiusM">,
  distanceM: number,
): string {
  const along = walk.sampleCount > 1 ? `${Math.round(distanceM)} / ${Math.round(walk.lengthM)} m · ` : "";
  return `${along}${viewshedCardMeta(walk.eyeM, walk.radiusM)}`;
}
