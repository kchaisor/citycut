import { describe, expect, it } from "vitest";
import { treeCrownSphereLayout } from "./treeMassing";

describe("treeCrownSphereLayout", () => {
  it("uses uniform scale equal to crown diameter", () => {
    const layout = treeCrownSphereLayout(12, 8);
    expect(layout.scale).toBe(8);
    expect(layout.radius).toBe(4);
  });

  it("places the top of the sphere at the tree height when the crown fits", () => {
    const layout = treeCrownSphereLayout(12, 8);
    expect(layout.centerY + layout.radius).toBeCloseTo(12, 6);
  });

  it("clamps the sphere above ground when crown width exceeds height", () => {
    const layout = treeCrownSphereLayout(5, 9);
    expect(layout.centerY - layout.radius).toBeGreaterThanOrEqual(-1e-6);
    expect(layout.centerY).toBe(4.5);
  });
});
