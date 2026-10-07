import { describe, expect, it } from "vitest";
import { defaultExplodedAxoSettings, explodedAxoBounds } from "./explodedAxo";
import { explodedAxoViewportExtent, planViewportEqual, planViewportExtent } from "./planViewport";
import { model } from "./aiExport.test";

describe("planViewportExtent", () => {
  const sideM = 500;

  it("matches before and after switching site plan and figure-ground each way", () => {
    const site = planViewportExtent(sideM);
    const figure = planViewportExtent(sideM);
    expect(planViewportEqual(site, figure)).toBe(true);

    const afterSiteAgain = planViewportExtent(sideM);
    const afterFigureAgain = planViewportExtent(sideM);
    expect(planViewportEqual(afterSiteAgain, site)).toBe(true);
    expect(planViewportEqual(afterFigureAgain, figure)).toBe(true);
    expect(planViewportEqual(afterSiteAgain, afterFigureAgain)).toBe(true);
  });

  it("uses the same extent for exploded axo switching as site and figure-ground framing baseline", () => {
    const m = model();
    const plan = planViewportExtent(m.sideM);
    const axo = explodedAxoViewportExtent(explodedAxoBounds(m, defaultExplodedAxoSettings(m.sideM)));
    expect(axo.w).toBeGreaterThan(m.sideM);
    expect(axo.h).toBeGreaterThan(m.sideM);
    expect(planViewportEqual(plan, planViewportExtent(m.sideM))).toBe(true);
  });

  it("frames the cut square with asymmetric vertical margin for annotations", () => {
    const view = planViewportExtent(sideM);
    const half = sideM / 2;
    expect(view.x).toBeCloseTo(-half - sideM * 0.06, 5);
    expect(view.y).toBeCloseTo(-half - sideM * 0.09, 5);
    expect(view.w).toBeCloseTo(sideM + sideM * 0.12, 5);
    expect(view.h).toBeCloseTo(sideM + sideM * 0.2, 5);
  });
});
