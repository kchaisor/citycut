import { describe, expect, it } from "vitest";
import { overtureBuildingHeight, resolveBuildingHeight } from "./overtureHeight";

describe("overtureBuildingHeight", () => {
  it("prefers height, then num_floors, then default", () => {
    expect(overtureBuildingHeight({ height: 22 })).toBe(22);
    expect(overtureBuildingHeight({ num_floors: 5 })).toBe(15);
    expect(overtureBuildingHeight({}, { footprintAreaM2: 100 })).toBe(9);
    expect(overtureBuildingHeight({}, { footprintAreaM2: 100, zoneCode: "GRZ1" })).toBe(7);
  });

  it("lets CoM height win when supplied", () => {
    expect(resolveBuildingHeight({ height: 9 }, 245.5)).toBe(245.5);
  });
});
