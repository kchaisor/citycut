import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { sunStudyViewportFill } from "./sunStudySurfaceViewport";

describe("sunStudySurfaceViewport", () => {
  it("uses white for ground, roads, and parks and dedicated blue for water when the sun path is on", () => {
    expect(sunStudyViewportFill("Ground", true)).toBe(getColour("--sun-study-surface"));
    expect(sunStudyViewportFill("Roads", true)).toBe(getColour("--sun-study-surface"));
    expect(sunStudyViewportFill("Green", true)).toBe(getColour("--sun-study-surface"));
    expect(sunStudyViewportFill("Water", true)).toBe(getColour("--water-sunpath"));
    expect(sunStudyViewportFill("Water", false)).toBeNull();
  });
});
