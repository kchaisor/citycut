import { describe, expect, it } from "vitest";
import { cutSpecFromA3 } from "./cutSpec";
import { makeSiteFrame, PLINTH_SHADOW_SPREAD, plinthShadowExtents } from "./siteFrame";

describe("plinth contact shadow extents", () => {
  it("match the A3 base rectangle at 1.5× spread", () => {
    const spec = cutSpecFromA3(3000, "landscape");
    const frame = makeSiteFrame(Math.max(spec.widthM, spec.heightM), "a3", {
      widthM: spec.widthM,
      heightM: spec.heightM,
    });
    expect(plinthShadowExtents(frame)).toEqual({
      widthM: spec.widthM * PLINTH_SHADOW_SPREAD,
      heightM: spec.heightM * PLINTH_SHADOW_SPREAD,
    });
  });

  it("stay square when width equals height", () => {
    const frame = makeSiteFrame(500, "square");
    const extents = plinthShadowExtents(frame);
    expect(extents.widthM).toBeCloseTo(extents.heightM);
  });
});