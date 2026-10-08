import { describe, expect, it } from "vitest";
import { OSM_BUILDING_USE, cascadeUse, classify, normaliseZoneCode, useFromZone } from "./buildingUse";

describe("classify building use", () => {
  it("maps the common building tags", () => {
    expect(classify({ building: "apartments" })).toBe("residential");
    expect(classify({ building: "house" })).toBe("residential");
    expect(classify({ building: "residential" })).toBe("residential");
    expect(classify({ building: "terrace" })).toBe("residential");
    expect(classify({ building: "dormitory" })).toBe("residential");
    expect(classify({ building: "office" })).toBe("commercial");
    expect(classify({ building: "commercial" })).toBe("commercial");
    expect(classify({ "building:use": "commercial" })).toBe("commercial");
    expect(classify({ building: "retail" })).toBe("retail");
    expect(classify({ building: "supermarket" })).toBe("retail");
    expect(classify({ shop: "bakery" })).toBe("retail");
    expect(classify({ building: "industrial" })).toBe("industrial");
    expect(classify({ building: "warehouse" })).toBe("industrial");
    expect(classify({ building: "factory" })).toBe("industrial");
    expect(classify({ building: "school" })).toBe("civic");
    expect(classify({ building: "university" })).toBe("civic");
    expect(classify({ building: "college" })).toBe("civic");
    expect(classify({ building: "kindergarten" })).toBe("civic");
    expect(classify({ amenity: "school" })).toBe("civic");
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
    expect(classify({ building: "apartments", shop: "convenience" })).toBe("mixed_use");
    expect(classify({ building: "residential", office: "yes" })).toBe("mixed_use");
    expect(classify({ "building:use": "mixed" })).toBe("mixed_use");
    expect(classify({ building: "yes", "building:use": "residential;commercial" })).toBe("mixed_use");
  });

  it("leaves a bare yes unmatched, and uses landuse only then", () => {
    expect(classify({ building: "yes" })).toBeNull();
    expect(classify({})).toBeNull();
    expect(classify({ building: "yes", landuse: "residential" })).toBe("residential");
    expect(classify({ building: "yes", landuse: "industrial" })).toBe("industrial");
    expect(classify({ building: "school", landuse: "residential" })).toBe("civic");
  });
});

describe("tier tables", () => {
  it("keeps the OSM building table explicit", () => {
    expect(OSM_BUILDING_USE.house).toBe("residential");
    expect(OSM_BUILDING_USE.semidetached_house).toBe("residential");
    expect(OSM_BUILDING_USE.office).toBe("commercial");
    expect(OSM_BUILDING_USE.kiosk).toBe("retail");
    expect(OSM_BUILDING_USE.manufacture).toBe("industrial");
    expect(OSM_BUILDING_USE.fire_station).toBe("civic");
    expect(OSM_BUILDING_USE.cathedral).toBe("civic");
    expect(OSM_BUILDING_USE.sports_hall).toBe("recreation");
    expect(OSM_BUILDING_USE.grandstand).toBe("recreation");
    expect(OSM_BUILDING_USE.shed).toBe("outbuilding");
    expect(OSM_BUILDING_USE.garage).toBe("outbuilding");
    expect(OSM_BUILDING_USE.hut).toBe("outbuilding");
    expect(OSM_BUILDING_USE.yes).toBeUndefined();
  });

  it("normalises schedule digits and leaves C1Z and IN3Z intact", () => {
    expect(normaliseZoneCode("GRZ1")).toBe("GRZ");
    expect(normaliseZoneCode("NRZ12")).toBe("NRZ");
    expect(normaliseZoneCode("PUZ2")).toBe("PUZ");
    expect(normaliseZoneCode("PUZ6")).toBe("PUZ");
    expect(normaliseZoneCode(" SUZ6 ")).toBe("SUZ");
    expect(normaliseZoneCode("IN3Z")).toBe("IN3Z");
    expect(normaliseZoneCode("C1Z")).toBe("C1Z");
    expect(normaliseZoneCode("B4Z")).toBe("B4Z");
    expect(normaliseZoneCode("DDO1")).toBe("DDO");
    expect(useFromZone("GRZ7", 9)).toBe("residential");
    expect(useFromZone("HCTZ1", 9)).toBe("residential");
    expect(useFromZone("R1Z", 9)).toBe("residential");
    expect(useFromZone("MUZ", 40)).toBe("mixed_use");
    expect(useFromZone("IN3Z", 8)).toBe("industrial");
    expect(useFromZone("PUZ6", 12)).toBe("civic");
    expect(useFromZone("PPRZ", 6)).toBe("recreation");
    expect(useFromZone("B1Z", 6)).toBe("commercial");
    expect(useFromZone("B5Z", 30)).toBe("commercial");
    expect(useFromZone("C2Z", 8)).toBe("commercial");
    expect(useFromZone("TRZ2", 8)).toBeNull();
    expect(useFromZone("UFZ", 8)).toBeNull();
    expect(useFromZone("SUZ6", 8)).toBeNull();
    expect(useFromZone("CA", 8)).toBeNull();
    expect(useFromZone("GWZ", 8)).toBeNull();
    expect(useFromZone("DDO1", 8)).toBeNull();
  });

  it("sends a short C1Z building to retail and keeps 15 m commercial", () => {
    expect(useFromZone("C1Z", 14.99)).toBe("retail");
    expect(useFromZone("C1Z", 9)).toBe("retail");
    expect(useFromZone("c1z", 15)).toBe("commercial");
    expect(useFromZone("C1Z", 18)).toBe("commercial");
    expect(useFromZone("C2Z", 9)).toBe("commercial");
  });

  it("stops at an OSM tag, then a zone, then unclassified", () => {
    expect(
      cascadeUse({
        tags: { building: "house" },
        zoneCode: "IN1Z",
        heightM: 4,
      }),
    ).toEqual({ use: "residential", source: "osm_tag" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        zoneCode: "IN3Z",
        heightM: 4,
      }),
    ).toEqual({ use: "industrial", source: "zone" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        zoneCode: "C1Z",
        heightM: 9,
      }),
    ).toEqual({ use: "retail", source: "zone" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        zoneCode: "C1Z",
        heightM: 18,
      }),
    ).toEqual({ use: "commercial", source: "zone" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        zoneCode: "DDO1",
        heightM: 4,
      }),
    ).toEqual({ use: "unclassified", source: "none" });
    expect(cascadeUse({ tags: { building: "yes" }, heightM: 20 })).toEqual({
      use: "unclassified",
      source: "none",
    });
  });
});
