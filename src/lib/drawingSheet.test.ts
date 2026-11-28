import { describe, expect, it } from "vitest";
import { themeSheetColor } from "./drawingSheet";

describe("themeSheetColor", () => {
  it("reads --model-bg as the 3D view shows it", () => {
    expect(themeSheetColor("--model-bg")).toBe("#DCDDE0");
  });

  it("resolves a var() reference", () => {
    expect(themeSheetColor("--page-bg")).toBe(themeSheetColor("--background"));
  });
});
