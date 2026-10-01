import { describe, expect, it } from "vitest";
import {
  PLAN_CAMERA_UP,
  PLAN_VIEW_OFFSET,
  fitPlanOrthoZoom,
  planEye,
  planNearFar,
  sitePlanBounds,
} from "./planCamera";
import { frameCentre } from "./isoCamera";

describe("planCamera", () => {
  const bounds = sitePlanBounds(1000, 10, 120);

  it("places the eye above the centre with a tiny Z offset", () => {
    const centre = frameCentre(bounds);
    expect(planEye(centre, 500)).toEqual([0, centre[1] + 500, 0.01]);
  });

  it("fits the full cut square in the viewport", () => {
    const zoom = fitPlanOrthoZoom(bounds, 1200, 800);
    expect(zoom).toBeGreaterThan(0);
    const metresWide = 1200 / zoom;
    const metresTall = 800 / zoom;
    expect(metresWide).toBeGreaterThanOrEqual(1000 * 0.99);
    expect(metresTall).toBeGreaterThanOrEqual(1000 * 0.99);
  });

  it("brackets depth along the vertical view axis", () => {
    const centre = frameCentre(bounds);
    const eye = planEye(centre, 800);
    const planes = planNearFar(bounds, centre);
    expect(planes.far).toBeGreaterThan(planes.near);
    expect(eye[1]).toBeGreaterThan(bounds.max[1]);
  });

  it("uses a vertical offset and north-up camera up", () => {
    expect(PLAN_VIEW_OFFSET).toEqual([0, 1, 0]);
    expect(PLAN_CAMERA_UP).toEqual([0, 0, -1]);
  });
});
