import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS,
  SunHoursGroundLegendList,
  dockCompactTickLabels,
} from "./SunHoursGroundLegendList";

describe("SunHoursGroundLegendList", () => {
  it("renders horizontal dock legend with five ticks and end units", () => {
    const html = renderToStaticMarkup(<SunHoursGroundLegendList maxHours={9.5} compact />);
    expect(html).toContain("sun-hours-direct-legend-scale");
    expect(html).toContain("0 h");
    expect(html).toContain("9.5 h");
    expect(html).toContain("3 m grid · ground, roofs, walls · full daylight");
    const liCount = (html.match(/<li>/g) ?? []).length;
    expect(liCount).toBe(5);
    expect(SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS).toBe(5);
  });

  it("formats dock ticks at quarter stops without units on mids", () => {
    expect(dockCompactTickLabels(9.5)).toEqual(["0 h", "2.4", "4.8", "7.1", "9.5 h"]);
  });
});