import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import {
  SUN_HOURS_GROUND_CELL_M,
  SUN_HOURS_GROUND_STEP_MINUTES,
  sunHoursGroundFromLitSteps,
  sunHoursGroundPaletteEndpointKeys,
  sunHoursGroundRgba,
} from "./sunHoursGround";

describe("sunHoursGround", () => {
  it("uses 3 m cells and 15-minute steps", () => {
    expect(SUN_HOURS_GROUND_CELL_M).toBe(3);
    expect(SUN_HOURS_GROUND_STEP_MINUTES).toBe(15);
  });

  it("maps lit steps to hours", () => {
    expect(sunHoursGroundFromLitSteps(4)).toBe(1);
    expect(sunHoursGroundFromLitSteps(0)).toBe(0);
  });

  it("palette endpoints are blue at 0 h and yellow at max", () => {
    const { minKey, maxKey } = sunHoursGroundPaletteEndpointKeys();
    expect(getColour(minKey).toLowerCase()).toBe("#313695");
    expect(getColour(maxKey).toLowerCase()).toBe("#fee825");
    const blue = sunHoursGroundRgba(0, 8, false);
    const yellow = sunHoursGroundRgba(8, 8, false);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(yellow[0]).toBeGreaterThan(220);
    expect(yellow[1]).toBeGreaterThan(200);
  });

  it("masks building footprints", () => {
    const masked = sunHoursGroundRgba(5, 8, true);
    expect(masked[3]).toBe(0);
  });
});
