import { describe, expect, it } from "vitest";
import { normaliseMassingColour } from "./massingImport";
import { shadeHex, buildAxoMassingFaces } from "./explodedAxoMassing";
import { getColour } from "./colours";
import { planBuildingFill } from "./planBuildingFill";
import type { BuildingFeat, CityModel } from "../types";

describe("imported massing colour", () => {
  it("defaults to the white --imported-massing token", () => {
    expect(getColour("--imported-massing")).toBe("#FFFFFF");
  });
  it("normalises picker values", () => {
    expect(normaliseMassingColour("#ff00aa")).toBe("#FF00AA");
    expect(normaliseMassingColour("red")).toBeNull();
    expect(normaliseMassingColour(undefined)).toBeNull();
  });
  it("shades walls toward black", () => {
    expect(shadeHex("#FFFFFF", 0.5)).toBe("#808080");
  });
  it("carries the colour into exploded axo faces", () => {
    const building = {
      id: "m1",
      importedMassing: true,
      importedColour: "#3366CC",
      height: 10,
      ring: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
      holes: [],
    } as unknown as BuildingFeat;
    const model = { sideM: 200, buildings: [building] } as unknown as CityModel;
    const { faces } = buildAxoMassingFaces(model);
    expect(faces.length).toBeGreaterThan(1);
    expect(faces.find((f) => f.paint === "building-roof")?.fill).toBe("#3366CC");
    expect(faces.every((f) => typeof f.fill === "string")).toBe(true);
  });
  it("uses the per-model colour for the plan fill", () => {
    const b = { importedMassing: true, importedColour: "#3366CC" } as unknown as BuildingFeat;
    expect(String(planBuildingFill({ buildings: [b] } as never, b, "uniform" as never, false)).toUpperCase()).toContain("3366CC");
  });
});
