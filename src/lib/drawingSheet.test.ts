import { describe, expect, it } from "vitest";
import { themeSheetColor } from "./drawingSheet";

describe("themeSheetColor", () => {
  it("resolves --model-bg through var(--background)", () => {
    expect(themeSheetColor("--model-bg")).toBe("#EBEBEB");
    expect(themeSheetColor("--model-bg")).toBe(themeSheetColor("--background"));
  });
});
