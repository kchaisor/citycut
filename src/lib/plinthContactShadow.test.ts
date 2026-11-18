// @vitest-environment happy-dom

import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { cutSpecFromA3 } from "./cutSpec";
import { makeSiteFrame, PLINTH_SHADOW_SPREAD } from "./siteFrame";
import * as plinthShadow from "./plinthContactShadow";

const colour = "#1a1a1a";

function withinOnePercent(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= expected * 0.01 + 1e-6;
}

describe("plinth contact shadow core", () => {
  for (const orientation of ["landscape", "portrait"] as const) {
    it(`${orientation} A3 core matches base w×h within 1%`, () => {
      const spec = cutSpecFromA3(3000, orientation);
      const frame = makeSiteFrame(Math.max(spec.widthM, spec.heightM), "a3", {
        widthM: spec.widthM,
        heightM: spec.heightM,
      });
      const core = plinthShadow.plinthShadowCoreExtentsM(frame);
      expect(withinOnePercent(core.widthM, frame.widthM)).toBe(true);
      expect(withinOnePercent(core.heightM, frame.heightM)).toBe(true);
    });
  }

  it("square core matches sideM within 1%", () => {
    const sideM = 1260;
    const frame = makeSiteFrame(sideM, "square");
    const core = plinthShadow.plinthShadowCoreExtentsM(frame);
    expect(withinOnePercent(core.widthM, sideM)).toBe(true);
    expect(withinOnePercent(core.heightM, sideM)).toBe(true);
  });

  it("plane spread × core fraction equals base dimensions", () => {
    const spec = cutSpecFromA3(3000, "landscape");
    const frame = makeSiteFrame(Math.max(spec.widthM, spec.heightM), "a3", {
      widthM: spec.widthM,
      heightM: spec.heightM,
    });
    const core = plinthShadow.plinthShadowCoreExtentsM(frame);
    expect(core.widthM / frame.widthM).toBeCloseTo(1, 5);
    expect(core.heightM / frame.heightM).toBeCloseTo(1, 5);
    expect(1 / PLINTH_SHADOW_SPREAD * PLINTH_SHADOW_SPREAD).toBe(1);
  });
});

describe("plinth shadow texture cache", () => {
  beforeEach(() => plinthShadow.clearPlinthShadowTextureCache());

  it("reuses the same texture for the same frame key", () => {
    const frame = makeSiteFrame(1260, "a3", { widthM: 1260, heightM: 891 });
    const baked = new THREE.CanvasTexture(document.createElement("canvas"));
    let bakeCount = 0;
    const baker = () => {
      bakeCount += 1;
      return baked;
    };
    const first = plinthShadow.getPlinthShadowTexture(frame, colour, baker);
    const second = plinthShadow.getPlinthShadowTexture(frame, colour, baker);
    expect(first).toBe(baked);
    expect(second).toBe(baked);
    expect(bakeCount).toBe(1);
    expect(plinthShadow.plinthShadowTextureCacheSize()).toBe(1);
  });

  it("stable cache key for equivalent frames", () => {
    const a = makeSiteFrame(1260, "a3", { widthM: 1260, heightM: 891 });
    const b = makeSiteFrame(1260, "a3", { widthM: 1260, heightM: 891 });
    expect(plinthShadow.plinthShadowTextureCacheKey(a, colour)).toBe(
      plinthShadow.plinthShadowTextureCacheKey(b, colour),
    );
  });
});