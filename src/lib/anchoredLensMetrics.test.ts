import { describe, expect, it } from "vitest";
import {
  ANCHORED_LENS_FLOOR_HEIGHT_M,
  anchoredLensEstimatedFloors,
  anchoredLensFloorsLine,
  anchoredLensHeightLine,
  anchoredLensSunHoursLine,
} from "./anchoredLensMetrics";
import type { BuildingFeat, CityModel } from "../types";
import type { SunHoursGrid } from "./sunHours";

function building(partial: Partial<BuildingFeat> & Pick<BuildingFeat, "id" | "ring">): BuildingFeat {
  return {
    holes: [],
    height: 9,
    use: "residential",
    source: "osm_tag",
    ...partial,
  };
}

describe("anchoredLensEstimatedFloors", () => {
  it("rounds height over 3.2 m per floor", () => {
    expect(ANCHORED_LENS_FLOOR_HEIGHT_M).toBe(3.2);
    expect(anchoredLensEstimatedFloors(3.2)).toBe(1);
    expect(anchoredLensEstimatedFloors(9.5)).toBe(3);
    expect(anchoredLensEstimatedFloors(16)).toBe(5);
  });

  it("labels floors as estimates", () => {
    expect(anchoredLensFloorsLine(16)).toBe("5 est.");
  });
});

describe("anchoredLensHeightLine", () => {
  it("marks zone defaults as estimates", () => {
    const est = building({ id: 1, ring: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], heightFromFallback: true });
    expect(anchoredLensHeightLine(est)).toBe("9.0 m est.");
  });

  it("shows measured height without est.", () => {
    const measured = building({
      id: 2,
      ring: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      height: 24,
      heightTier: "com",
    });
    expect(anchoredLensHeightLine(measured)).toBe("24.0 m");
  });
});

describe("anchoredLensSunHoursLine", () => {
  it("returns null without a grid", () => {
    const model = { sideM: 100, buildings: [] } as unknown as CityModel;
    const b = building({ id: 3, ring: [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]] });
    expect(anchoredLensSunHoursLine(model, b, null)).toBeNull();
  });

  it("reads sun hours near a footprint centroid", () => {
    const grid: SunHoursGrid = {
      res: 4,
      hours: new Float32Array(16).fill(-1),
      maxHours: 8,
      steps: 16,
      skipped: 0,
      ms: 1,
    };
    grid.hours[10] = 4.5;
    const model = { sideM: 100, buildings: [] } as unknown as CityModel;
    const b = building({ id: 4, ring: [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]] });
    expect(anchoredLensSunHoursLine(model, b, grid)).toBe("4.5 h");
  });
});
