import { describe, expect, it } from "vitest";
import {
  OSM_BUILDING_USE,
  cascadeUse,
  classify,
  normaliseZoneCode,
  useFromClue,
  useFromHeuristic,
  useFromLanduseTag,
  useFromZone,
  usesFromPoi,
  votePoi,
} from "./buildingUse";

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

  it("maps CLUE space use, and drops unoccupied or unknown values", () => {
    expect(useFromClue("House/Townhouse")).toBe("residential");
    expect(useFromClue("Student Accommodation")).toBe("residential");
    expect(useFromClue("Office")).toBe("commercial");
    expect(useFromClue("Commercial Accommodation")).toBe("commercial");
    expect(useFromClue("Retail - Shop")).toBe("retail");
    expect(useFromClue("Workshop/Studio")).toBe("industrial");
    expect(useFromClue("Warehouse")).toBe("industrial");
    expect(useFromClue("Educational/Research")).toBe("civic");
    expect(useFromClue("Performances, Conferences, Ceremonies")).toBe("civic");
    expect(useFromClue("Entertainment/Recreation - Indoor")).toBe("recreation");
    expect(useFromClue("Parking - Private Covered")).toBe("commercial");
    expect(useFromClue("Parking - Commercial Covered")).toBe("commercial");
    expect(useFromClue("Unoccupied - Unused")).toBeNull();
    expect(useFromClue("Unoccupied - Under Construction")).toBeNull();
    expect(useFromClue("Not a real use")).toBeNull();
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

  it("applies the footprint heuristic in order", () => {
    expect(useFromHeuristic(44.9, 20)).toBe("outbuilding");
    expect(useFromHeuristic(45, 4)).toBe("residential");
    expect(useFromHeuristic(45, 10)).toBeNull();
    expect(useFromHeuristic(349, 9.9)).toBe("residential");
    expect(useFromHeuristic(349, 10)).toBeNull();
    expect(useFromHeuristic(350, 8)).toBeNull();
    expect(useFromHeuristic(1500, 11)).toBeNull();
    expect(useFromHeuristic(1500.1, 11.9)).toBe("industrial");
    expect(useFromHeuristic(2000, 12)).toBeNull();
    expect(useFromHeuristic(30, 3)).toBe("outbuilding");
  });

  it("maps landuse polygons and ignores values outside that list", () => {
    expect(useFromLanduseTag("residential")).toBe("residential");
    expect(useFromLanduseTag("commercial")).toBe("commercial");
    expect(useFromLanduseTag("retail")).toBe("retail");
    expect(useFromLanduseTag("industrial")).toBe("industrial");
    expect(useFromLanduseTag("institutional")).toBe("civic");
    expect(useFromLanduseTag("education")).toBeNull();
    expect(useFromLanduseTag("recreation_ground")).toBeNull();
    expect(useFromLanduseTag("civic")).toBeNull();
  });

  it("keeps the POI list to amenity, shop, office, and leisure", () => {
    expect(usesFromPoi({ amenity: "school" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "university" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "college" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "kindergarten" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "hospital" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "clinic" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "doctors" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "place_of_worship" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "library" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "community_centre" })).toEqual(["civic"]);
    expect(usesFromPoi({ amenity: "pharmacy" })).toEqual(["retail"]);
    expect(usesFromPoi({ amenity: "restaurant" })).toEqual(["retail"]);
    expect(usesFromPoi({ amenity: "cafe" })).toEqual(["retail"]);
    expect(usesFromPoi({ amenity: "bar" })).toEqual(["retail"]);
    expect(usesFromPoi({ amenity: "pub" })).toEqual(["retail"]);
    expect(usesFromPoi({ amenity: "fast_food" })).toEqual(["retail"]);
    expect(usesFromPoi({ shop: "bakery" })).toEqual(["retail"]);
    expect(usesFromPoi({ office: "lawyer" })).toEqual(["commercial"]);
    expect(usesFromPoi({ leisure: "sports_centre" })).toEqual(["recreation"]);
    expect(usesFromPoi({ leisure: "fitness_centre" })).toEqual(["recreation"]);
    expect(usesFromPoi({ craft: "brewery" })).toEqual([]);
    expect(usesFromPoi({ amenity: "police" })).toEqual([]);
    expect(usesFromPoi({ amenity: "townhall" })).toEqual([]);
    expect(usesFromPoi({ amenity: "bench" })).toEqual([]);
    expect(usesFromPoi({ leisure: "swimming_pool" })).toEqual([]);
    expect(usesFromPoi({ leisure: "park" })).toEqual([]);
    expect(votePoi(usesFromPoi({ shop: "bakery", building: "apartments" }))).toBe("mixed_use");
    expect(votePoi(usesFromPoi({ office: "yes", building: "residential" }))).toBe("mixed_use");
  });

  it("stops the cascade at the first matching tier", () => {
    expect(
      cascadeUse({
        tags: { building: "house" },
        poiVotes: ["retail"],
        landuse: "industrial",
        clueValues: ["Office"],
        zoneCode: "IN1Z",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "residential", source: "osm_tag" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        poiVotes: ["retail"],
        landuse: "industrial",
        clueValues: ["Office"],
        zoneCode: "IN1Z",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "retail", source: "osm_poi" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        landuse: "industrial",
        clueValues: ["Office"],
        zoneCode: "GRZ1",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "industrial", source: "osm_landuse" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        landuse: "institutional",
        clueValues: ["Office"],
        zoneCode: "GRZ1",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "civic", source: "osm_landuse" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        clueValues: ["Office", "Office", "Retail - Shop"],
        zoneCode: "IN1Z",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "commercial", source: "clue" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        clueValues: ["Unoccupied - Unused"],
        zoneCode: "IN3Z",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "industrial", source: "zone" });
    expect(
      cascadeUse({
        tags: { building: "yes" },
        zoneCode: "DDO1",
        heightM: 4,
        areaM2: 20,
      }),
    ).toEqual({ use: "outbuilding", source: "heuristic" });
    expect(cascadeUse({ tags: { building: "yes" }, heightM: 20, areaM2: 400 })).toEqual({
      use: "unclassified",
      source: "none",
    });
    expect(votePoi(["retail", "residential"])).toBe("mixed_use");
    expect(votePoi(["commercial", "residential"])).toBe("mixed_use");
    expect(votePoi(["retail", "retail", "commercial"])).toBe("retail");
  });
});
