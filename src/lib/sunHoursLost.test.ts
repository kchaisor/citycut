import { describe, expect, it } from "vitest";
import {
  SUN_HOURS_LOST_CELL_M,
  sunHoursLostBucket,
  sunHoursLostColourKey,
  sunHoursLostFromStepCounts,
} from "./sunHoursLost";

describe("sun hours lost maths", () => {
  it("uses a 3 m plan grid cell", () => {
    expect(SUN_HOURS_LOST_CELL_M).toBe(3);
  });

  it("converts lit step deltas to lost hours at 15-minute steps", () => {
    expect(sunHoursLostFromStepCounts(20, 20)).toBe(0);
    expect(sunHoursLostFromStepCounts(20, 12)).toBe(2);
    expect(sunHoursLostFromStepCounts(8, 0)).toBe(2);
    expect(sunHoursLostFromStepCounts(10, 14)).toBe(0);
  });

  it("buckets loss for the legend ramp", () => {
    expect(sunHoursLostBucket(0)).toBe(0);
    expect(sunHoursLostBucket(0.25)).toBe(1);
    expect(sunHoursLostBucket(1)).toBe(1);
    expect(sunHoursLostBucket(1.01)).toBe(2);
    expect(sunHoursLostBucket(4.2)).toBe(5);
    expect(sunHoursLostBucket(3.2)).toBe(4);
    expect(sunHoursLostBucket(5)).toBe(5);
    expect(sunHoursLostBucket(7)).toBe(5);
    expect(sunHoursLostColourKey(0)).toBeNull();
    expect(sunHoursLostColourKey(2.5)).toBe("--sun-hours-lost-3");
    expect(sunHoursLostColourKey(6)).toBe("--sun-hours-lost-5plus");
  });
});
