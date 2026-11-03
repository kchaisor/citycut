import { describe, expect, it } from "vitest";
import { colourForDensity, colourForMetric } from "./demographicsDensityColour";

describe("demographicsDensityColour", () => {
  it("returns token-backed colours without inline rgb or hex", () => {
    const samples = [0, 25, 90, 200];
    for (const value of samples) {
      const fill = colourForDensity(value);
      expect(fill).not.toMatch(/rgb\(/);
      expect(fill.length).toBeGreaterThan(0);
    }
    const rentFill = colourForMetric(540, "rent");
    expect(rentFill).not.toMatch(/rgb\(/);
  });
});
