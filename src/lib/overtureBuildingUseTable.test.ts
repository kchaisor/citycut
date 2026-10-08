import { describe, expect, it } from "vitest";
import shared from "../../shared/overture-building-use.json";
import { OSM_BUILDING_USE } from "./buildingUse";

describe("overture building use table", () => {
  it("matches shared/overture-building-use.json", () => {
    expect(OSM_BUILDING_USE).toEqual(shared);
  });
});
