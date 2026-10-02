import { describe, expect, it } from "vitest";
import { heliodonRadiusM } from "./heliodonRadius";
import {
  DEFAULT_PERSPECTIVE_OFFSET,
  heliodonSceneBounds,
  perspectiveFitDistance,
  siteBounds,
  unionAabb,
} from "./heliodonFraming";
import { frameCentre } from "./isoCamera";

const CBD = { lat: -37.8136, lon: 144.9631 };

describe("heliodon perspective framing", () => {
  it("expands bounds beyond the site to include the horizon ring and labels", () => {
    const sideM = 1000;
    const ring = heliodonRadiusM(sideM, 1.75);
    const site = siteBounds(sideM, 0, 120);
    const bounds = heliodonSceneBounds({
      ...CBD,
      year: 2026,
      month: 9,
      day: 22,
      hour: 9,
      minute: 0,
      sideM,
      ringRadiusM: ring,
      groundY: 0,
      siteTopY: 120,
    });
    expect(bounds.max[0]).toBeGreaterThan(site.max[0]);
    expect(bounds.max[0]).toBeGreaterThanOrEqual(ring * 0.95);
    expect(bounds.max[1]).toBeGreaterThan(ring * 0.4);
  });

  it("needs a longer camera distance when the heliodon radius grows", () => {
    const sideM = 1000;
    const small = heliodonSceneBounds({
      ...CBD,
      year: 2026,
      month: 9,
      day: 22,
      hour: 9,
      minute: 0,
      sideM,
      ringRadiusM: heliodonRadiusM(sideM, 1.75),
      groundY: 0,
      siteTopY: 120,
    });
    const large = heliodonSceneBounds({
      ...CBD,
      year: 2026,
      month: 6,
      day: 21,
      hour: 12,
      minute: 0,
      sideM,
      ringRadiusM: heliodonRadiusM(sideM, 2.5),
      groundY: 0,
      siteTopY: 120,
    });
    const target = frameCentre(unionAabb(small, large));
    const aspect = 16 / 10;
    const near = perspectiveFitDistance(small, target, DEFAULT_PERSPECTIVE_OFFSET, 32, aspect);
    const far = perspectiveFitDistance(large, target, DEFAULT_PERSPECTIVE_OFFSET, 32, aspect);
    expect(far).toBeGreaterThan(near);
  });
});
