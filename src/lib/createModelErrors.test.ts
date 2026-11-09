import { describe, expect, it } from "vitest";
import { formatCreateModelError } from "./createModelErrors";

describe("formatCreateModelError", () => {
  it("hides raw polygon-clipping dumps", () => {
    const raw = new Error(
      "Unable to complete output ring starting at [205.985, -180.7984]. Last matching segment found ends at [619.4484835296299, -194.4047084346072].",
    );
    expect(formatCreateModelError(raw)).not.toMatch(/Last matching segment/);
    expect(formatCreateModelError(raw)).toMatch(/Could not merge some map polygons/);
  });

  it("keeps short actionable errors", () => {
    expect(formatCreateModelError(new Error("Terrain unavailable for this cut."))).toBe(
      "Terrain unavailable for this cut.",
    );
  });
});
