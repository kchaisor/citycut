import { describe, expect, it } from "vitest";
import {
  hourInDaypart,
  isWindDaypartId,
  WIND_AFTERNOON_HOURS,
  WIND_DAYPART_CARD_NOTE,
  WIND_DAYPARTS,
  WIND_MORNING_HOURS,
} from "./windDayparts";

describe("wind dayparts", () => {
  it("treats 6am–12pm as EPW hours 7–12 and 12pm–6pm as 13–18", () => {
    expect([...WIND_MORNING_HOURS]).toEqual([7, 8, 9, 10, 11, 12]);
    expect([...WIND_AFTERNOON_HOURS]).toEqual([13, 14, 15, 16, 17, 18]);
    expect(hourInDaypart(6, "morning")).toBe(false);
    expect(hourInDaypart(7, "morning")).toBe(true);
    expect(hourInDaypart(12, "morning")).toBe(true);
    expect(hourInDaypart(13, "morning")).toBe(false);
    expect(hourInDaypart(13, "afternoon")).toBe(true);
    expect(hourInDaypart(18, "afternoon")).toBe(true);
    expect(hourInDaypart(19, "afternoon")).toBe(false);
    expect(hourInDaypart(1, "all")).toBe(true);
    expect(hourInDaypart(24, "all")).toBe(true);
    expect(hourInDaypart(undefined, "all")).toBe(true);
    expect(hourInDaypart(undefined, "morning")).toBe(false);
  });

  it("keeps All day as the default id and shows the hour windows in the card note", () => {
    expect(isWindDaypartId("all")).toBe(true);
    expect(isWindDaypartId("night")).toBe(false);
    expect(WIND_DAYPARTS.all.label).toBe("All day");
    expect(WIND_DAYPART_CARD_NOTE).toContain("6am–12pm");
    expect(WIND_DAYPART_CARD_NOTE).toContain("12pm–6pm");
    expect(WIND_DAYPART_CARD_NOTE).toMatch(/local standard time/i);
  });
});
