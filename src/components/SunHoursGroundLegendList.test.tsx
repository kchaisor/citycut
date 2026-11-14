import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS, SunHoursGroundLegendList } from "./SunHoursGroundLegendList";

describe("SunHoursGroundLegendList", () => {
  it("renders five dock ticks when compact", () => {
    const html = renderToStaticMarkup(<SunHoursGroundLegendList maxHours={9.5} compact />);
    const tickMatches = html.match(/sun-hours-direct-legend-ticks/g);
    expect(tickMatches?.length).toBe(1);
    expect(SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS).toBe(5);
    const liCount = (html.match(/<li>/g) ?? []).length;
    expect(liCount).toBe(5);
  });
});