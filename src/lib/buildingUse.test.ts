import { describe, expect, it } from "vitest";
import { classify } from "./buildingUse";

describe("classify building use", () => {
  it("maps the common building tags", () => {
    expect(classify({ building: "apartments" })).toBe("residential");
    expect(classify({ building: "house" })).toBe("residential");
    expect(classify({ building: "residential" })).toBe("residential");
    expect(classify({ building: "terrace" })).toBe("residential");
    expect(classify({ building: "dormitory" })).toBe("residential");
    expect(classify({ building: "office" })).toBe("office");
    expect(classify({ building: "commercial" })).toBe("office");
    expect(classify({ "building:use": "commercial" })).toBe("office");
    expect(classify({ building: "retail" })).toBe("retail");
    expect(classify({ building: "supermarket" })).toBe("retail");
    expect(classify({ shop: "bakery" })).toBe("retail");
    expect(classify({ building: "industrial" })).toBe("industrial");
    expect(classify({ building: "warehouse" })).toBe("industrial");
    expect(classify({ building: "factory" })).toBe("industrial");
    expect(classify({ building: "school" })).toBe("education");
    expect(classify({ building: "university" })).toBe("education");
    expect(classify({ building: "college" })).toBe("education");
    expect(classify({ building: "kindergarten" })).toBe("education");
    expect(classify({ amenity: "school" })).toBe("education");
    expect(classify({ building: "civic" })).toBe("civic");
    expect(classify({ building: "public" })).toBe("civic");
    expect(classify({ building: "government" })).toBe("civic");
    expect(classify({ building: "hospital" })).toBe("civic");
    expect(classify({ building: "church" })).toBe("civic");
    expect(classify({ amenity: "community_centre" })).toBe("civic");
    expect(classify({ amenity: "library" })).toBe("civic");
    expect(classify({ amenity: "townhall" })).toBe("civic");
  });

  it("treats a home with a shop or office as mixed-use", () => {
    expect(classify({ building: "apartments", shop: "convenience" })).toBe("mixed");
    expect(classify({ building: "residential", office: "yes" })).toBe("mixed");
    expect(classify({ "building:use": "mixed" })).toBe("mixed");
    expect(classify({ building: "yes", "building:use": "residential;commercial" })).toBe("mixed");
  });

  it("leaves a bare yes as unknown, and uses landuse only then", () => {
    expect(classify({ building: "yes" })).toBe("unknown");
    expect(classify({})).toBe("unknown");
    expect(classify({ building: "yes", landuse: "residential" })).toBe("residential");
    expect(classify({ building: "yes", landuse: "industrial" })).toBe("industrial");
    expect(classify({ building: "school", landuse: "residential" })).toBe("education");
  });
});
