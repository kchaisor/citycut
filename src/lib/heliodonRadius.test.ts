import { describe, expect, it } from "vitest";
import {
  HELIODON_RADIUS_FACTOR_DEFAULT,
  HELIODON_RADIUS_FACTOR_MAX,
  HELIODON_RADIUS_FACTOR_MIN,
  clampHeliodonRadiusFactor,
  heliodonRadiusFromSearch,
  heliodonRadiusM,
  parseHeliodonRadiusFactor,
  resolveHeliodonRadiusFactor,
  resolveSunDomeRadiusM,
  sunDomeRadiusM,
  sunDomeRange,
  sunDomeSizeFromSlider,
  sunDomeSizeShare,
} from "./heliodonRadius";

describe("3D sun dome radius", () => {
  it("clamps a 1 km cut to 350 m", () => {
    expect(sunDomeRadiusM(1000)).toBe(350);
  });

  it("clamps a 200 m cut up to 120 m", () => {
    expect(sunDomeRadiusM(200)).toBe(120);
  });

  it("uses 0.6 × the half-diagonal for a mid cut", () => {
    expect(sunDomeRadiusM(400)).toBeCloseTo(0.6 * Math.hypot(200, 200), 6);
    expect(sunDomeRadiusM(400)).toBeGreaterThan(120);
    expect(sunDomeRadiusM(400)).toBeLessThan(350);
  });
});

describe("heliodon radius mapping", () => {
  it("maps factor to metres from the site half-width", () => {
    expect(heliodonRadiusM(1000, 1.75)).toBeCloseTo(875, 6);
    expect(heliodonRadiusM(500, 2)).toBeCloseTo(500, 6);
  });

  it("clamps stored and URL values", () => {
    expect(clampHeliodonRadiusFactor(0.1)).toBe(HELIODON_RADIUS_FACTOR_MIN);
    expect(clampHeliodonRadiusFactor(99)).toBe(HELIODON_RADIUS_FACTOR_MAX);
    expect(clampHeliodonRadiusFactor(Number.NaN)).toBe(HELIODON_RADIUS_FACTOR_DEFAULT);
  });

  it("reads heliodon from the query string", () => {
    expect(parseHeliodonRadiusFactor("2.25")).toBe(2.25);
    expect(heliodonRadiusFromSearch("?lat=1&heliodon=2.5")).toBe(2.5);
    expect(resolveHeliodonRadiusFactor(1.75, "?heliodon=0.8")).toBe(0.8);
    expect(resolveHeliodonRadiusFactor(1.75, "")).toBe(1.75);
  });
});

describe("sun dome size slider range", () => {
  const southbank = sunDomeRange({ sideM: 500 });
  const rozelle = sunDomeRange({ sideM: 1470, widthM: 1470, heightM: 1040 });

  it("runs from half the auto radius to twice the cut half-diagonal, with auto as the default", () => {
    expect(southbank.autoM).toBe(sunDomeRadiusM(500));
    expect(southbank.minM).toBe(southbank.autoM * 0.5);
    expect(southbank.maxM).toBe(Math.hypot(250, 250) * 2);
    expect([southbank.minM, southbank.autoM, southbank.maxM].map(Math.round)).toEqual([106, 212, 707]);
    expect([rozelle.minM, rozelle.autoM, rozelle.maxM].map(Math.round)).toEqual([175, 350, 1801]);
    expect(resolveSunDomeRadiusM(southbank, null)).toBe(southbank.autoM);
    expect(resolveSunDomeRadiusM(southbank, undefined)).toBe(southbank.autoM);
    expect(resolveSunDomeRadiusM(southbank, Number.NaN)).toBe(southbank.autoM);
  });

  it("clamps a chosen size into the range", () => {
    expect(resolveSunDomeRadiusM(southbank, 10)).toBe(southbank.minM);
    expect(resolveSunDomeRadiusM(southbank, 5000)).toBe(southbank.maxM);
    expect(resolveSunDomeRadiusM(southbank, 300)).toBe(300);
    expect(resolveSunDomeRadiusM(rozelle, 2000)).toBe(rozelle.maxM);
  });

  it("never lets the top of the range fall under the auto size on a tiny cut", () => {
    const tiny = sunDomeRange({ sideM: 100 });
    expect(tiny.autoM).toBe(120);
    expect(tiny.maxM).toBe(Math.hypot(50, 50) * 2);
    expect(tiny.maxM).toBeGreaterThan(tiny.autoM);
    expect(tiny.minM).toBe(60);
    const smaller = sunDomeRange({ sideM: 80 });
    expect(smaller.autoM).toBe(120);
    expect(smaller.maxM).toBe(120);
  });

  it("snaps back to auto beside the tick and reports the slider position as a share", () => {
    expect(sunDomeSizeFromSlider(southbank, 213)).toBeNull();
    expect(sunDomeSizeFromSlider(southbank, 300)).toBe(300);
    expect(sunDomeSizeFromSlider(southbank, 9999)).toBe(southbank.maxM);
    expect(sunDomeSizeShare(southbank, southbank.minM)).toBe(0);
    expect(sunDomeSizeShare(southbank, southbank.maxM)).toBe(1);
    expect(sunDomeSizeShare(rozelle, rozelle.autoM)).toBeCloseTo(0.108, 3);
  });

  it("is separate from the old heliodon radius factor", () => {
    expect(sunDomeRange({ sideM: 500 }).autoM).not.toBe(heliodonRadiusM(500, HELIODON_RADIUS_FACTOR_DEFAULT));
  });
});
