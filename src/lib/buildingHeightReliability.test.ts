import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../types";
import {
  HEIGHT_RELIABILITY_EXPORT_LAYER,
  countHeightReliabilityClasses,
  heightReliabilityClass,
} from "./buildingHeightReliability";

function building(partial: Partial<BuildingFeat> & Pick<BuildingFeat, "id">): BuildingFeat {
  return {
    ring: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    holes: [],
    height: 12,
    use: "residential",
    source: "none",
    ...partial,
  };
}

describe("buildingHeightReliability", () => {
  it("classifies surveyed tiers from stored height resolution", () => {
    expect(heightReliabilityClass(building({ id: 1, heightTier: "com" }))).toBe("surveyed");
    expect(heightReliabilityClass(building({ id: 2, heightTier: "lidar" }))).toBe("surveyed");
    expect(heightReliabilityClass(building({ id: 3, heightTier: "development_floors" }))).toBe("surveyed");
    expect(heightReliabilityClass(building({ id: 4, heightManual: true, heightTier: "manual" }))).toBe("surveyed");
  });

  it("classifies OSM and Overture tag tiers", () => {
    expect(heightReliabilityClass(building({ id: 5, heightTier: "overture_height" }))).toBe("osm_tagged");
    expect(heightReliabilityClass(building({ id: 6, heightTier: "overture_floors" }))).toBe("osm_tagged");
    expect(heightReliabilityClass(building({ id: 7, heightTier: "osm_levels" }))).toBe("osm_tagged");
  });

  it("classifies zone defaults and unmatched real sources as estimated", () => {
    expect(heightReliabilityClass(building({ id: 8, heightTier: "zone_default", heightFromFallback: true }))).toBe(
      "estimated",
    );
    expect(heightReliabilityClass(building({ id: 9, heightTier: "real_source_unmatched" }))).toBe("estimated");
  });

  it("counts buildings per class and maps export layer names", () => {
    const buildings = [
      building({ id: 1, heightTier: "com" }),
      building({ id: 2, heightTier: "overture_height" }),
      building({ id: 3, heightTier: "zone_default", heightFromFallback: true }),
    ];
    expect(countHeightReliabilityClasses(buildings)).toEqual({ surveyed: 1, osm_tagged: 1, estimated: 1 });
    expect(HEIGHT_RELIABILITY_EXPORT_LAYER.surveyed).toBe("CC_Height_Surveyed");
    expect(HEIGHT_RELIABILITY_EXPORT_LAYER.osm_tagged).toBe("CC_Height_OSM");
    expect(HEIGHT_RELIABILITY_EXPORT_LAYER.estimated).toBe("CC_Height_Estimated");
  });
});
