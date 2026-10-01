import { eyeDistance, fitOrthoZoom, orthoNearFar, type Aabb, type Vec3 } from "./isoCamera";

/** Unit vector from the frame centre toward a north-up plan camera (straight above). */
export const PLAN_VIEW_OFFSET: Vec3 = [0, 1, 0];

/** World up for a plan camera so true north (−Z) sits at the top of the screen. */
export const PLAN_CAMERA_UP: Vec3 = [0, 0, -1];

/** Margin around the cut square when fitting the plan view. */
export const PLAN_FIT_MARGIN = 1.06;

/** Eye position for a straight-down orthographic view. A tiny Z offset avoids gimbal lock. */
export function planEye(centre: Vec3, distance: number): Vec3 {
  return [centre[0], centre[1] + distance, centre[2] + 0.01];
}

/** Square bounds of the cut in local east/north metres, for framing the dial and site. */
export function sitePlanBounds(sideM: number, groundY: number, topY: number): Aabb {
  const half = sideM / 2;
  return {
    min: [-half, groundY, -half],
    max: [half, Math.max(topY, groundY + 1), half],
  };
}

/** Orthographic zoom that fits `bounds` in a north-up plan view. */
export function fitPlanOrthoZoom(bounds: Aabb, viewWidth: number, viewHeight: number): number {
  return fitOrthoZoom(bounds, PLAN_VIEW_OFFSET, viewWidth, viewHeight);
}

export function planNearFar(bounds: Aabb, centre: Vec3): { near: number; far: number } {
  const distance = eyeDistance(bounds);
  const eye = planEye(centre, distance);
  return orthoNearFar(bounds, eye, centre);
}

export function planEyeDistance(bounds: Aabb): number {
  return Math.max(eyeDistance(bounds), 1);
}
