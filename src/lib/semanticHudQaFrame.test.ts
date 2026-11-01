import { describe, expect, it } from "vitest";
import { semanticOverviewPose, semanticWalkPose } from "./semanticHudQaFrame";

describe("semanticHudQaFrame", () => {
  it("keeps walk eye above ground elevation", () => {
    const frame = { groundY: 72, siteY: 85, topY: 103, sideM: 400 };
    const walk = semanticWalkPose(frame);
    expect(walk.eye.y).toBeGreaterThan(frame.groundY + 1);
    expect(walk.target.y).toBeGreaterThan(frame.groundY);
  });

  it("frames overview above site centre", () => {
    const frame = { groundY: 72, siteY: 85, topY: 103, sideM: 400 };
    const overview = semanticOverviewPose(frame);
    expect(overview.eye.y).toBeGreaterThan(frame.siteY);
    expect(overview.target.y).toBe(frame.siteY);
  });
});
