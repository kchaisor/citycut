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
} from "./heliodonRadius";

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
