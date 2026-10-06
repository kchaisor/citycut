import { describe, expect, it } from "vitest";
import type { BuildingFeat, Pt } from "../types";
import type { ParcelPolygon } from "./vicmapSiteParcel";
import {
  SITE_OVERLAP_FRACTION,
  siteBuildingIdsFromParcel,
  siteBuildingIdsFromPoint,
} from "./siteBuildings";

function square(minX: number, minY: number, maxX: number, maxY: number): Pt[] {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function building(id: number, ring: Pt[]): BuildingFeat {
  return { id, ring, holes: [], height: 9, use: "residential", source: "none" };
}

const parcel: ParcelPolygon[] = [{ outer: square(0, 0, 20, 20), holes: [] }];

describe("siteBuildingIdsFromParcel", () => {
  it("selects a building when more than half its area is inside the parcel", () => {
    const ids = siteBuildingIdsFromParcel([building(1, square(5, 5, 15, 15))], parcel);
    expect(ids).toEqual([1]);
  });

  it("skips a building when half or less of its area is inside", () => {
    const ids = siteBuildingIdsFromParcel([building(2, square(15, 5, 25, 15))], parcel);
    expect(ids).toEqual([]);
  });

  it("handles a parcel hole so only the outer ring counts", () => {
    const holed: ParcelPolygon[] = [
      { outer: square(0, 0, 30, 30), holes: [square(10, 10, 20, 20)] },
    ];
    const insideHole = siteBuildingIdsFromParcel([building(3, square(12, 12, 18, 18))], holed);
    expect(insideHole).toEqual([]);
    const straddling = siteBuildingIdsFromParcel([building(4, square(5, 5, 15, 15))], holed);
    expect(straddling).toEqual([4]);
  });

  it("uses the configured overlap threshold", () => {
    const halfInside = building(5, square(10, 0, 30, 20));
    expect(siteBuildingIdsFromParcel([halfInside], parcel, SITE_OVERLAP_FRACTION)).toEqual([]);
    expect(siteBuildingIdsFromParcel([halfInside], parcel, 0.49)).toEqual([5]);
  });
});

describe("siteBuildingIdsFromPoint", () => {
  it("returns the building containing the geocoded point", () => {
    const ids = siteBuildingIdsFromPoint(
      [building(1, square(0, 0, 10, 10)), building(2, square(20, 0, 30, 10))],
      [5, 5],
    );
    expect(ids).toEqual([1]);
  });

  it("returns none when no footprint contains the point", () => {
    expect(siteBuildingIdsFromPoint([building(1, square(0, 0, 10, 10))], [50, 50])).toEqual([]);
  });
});
