import { describe, expect, it } from "vitest";
import {
  SUN_STUDY_GROUND_COLOR_SCALE,
  SUN_STUDY_ROAD_COLOR_SCALE,
  tintSunStudyHex,
} from "./sunStudySurfaceViewport";
import { getColour } from "./colours";

describe("sunStudySurfaceViewport", () => {
  it("darkens ground and road fills for sun study without crushing to black", () => {
    const ground = tintSunStudyHex(getColour("--ground-fill"), SUN_STUDY_GROUND_COLOR_SCALE);
    const road = tintSunStudyHex(getColour("--road-local"), SUN_STUDY_ROAD_COLOR_SCALE);
    const groundValue = parseInt(ground.slice(1), 16);
    const groundSum =
      ((groundValue >> 16) & 255) + ((groundValue >> 8) & 255) + (groundValue & 255);
    expect(groundSum).toBeLessThan(720);
    expect(groundSum).toBeGreaterThan(180);

    const roadValue = parseInt(road.slice(1), 16);
    const roadSum = ((roadValue >> 16) & 255) + ((roadValue >> 8) & 255) + (roadValue & 255);
    expect(roadSum).toBeLessThan(520);
    expect(roadSum).toBeGreaterThan(60);
  });
});
