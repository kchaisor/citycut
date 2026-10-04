import { describe, expect, it } from "vitest";
import { overtureBuildingHeight, resolveBuildingHeight } from "./overtureHeight";

describe("overtureBuildingHeight", () => {
  it("prefers height, then num_floors, then default", () => {
    expect(overtureBuildingHeight({ height: 22 })).toBe(22);
    expect(overtureBuildingHeight({ num_floors: 5 })).toBe(15);
    expect(overtureBuildingHeight({})).toBe(9);
  });

  it("lets CoM height win when supplied", () => {
    expect(resolveBuildingHeight({ height: 9 }, 245.5)).toBe(245.5);
  });
});
