import { describe, expect, it } from "vitest";
import { defaultSectionKnifePose, knifePlane, poseFromPlane } from "./plane";

describe("sectionKnife plane", () => {
  it("round-trips pose through THREE.Plane", () => {
    const pose = defaultSectionKnifePose(400);
    const back = poseFromPlane(knifePlane(pose));
    expect(back.offsetM).toBeCloseTo(pose.offsetM, 5);
    expect(back.angleRad).toBeCloseTo(pose.angleRad, 5);
  });
});
