import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS,
  SunHoursGroundLegendList,
  dockCompactTickLabels,
} from "./SunHoursGroundLegendList";
import { sunHoursQualityParams, sunHoursResolution } from "../lib/sunHoursQuality";

const fast = sunHoursResolution(sunHoursQualityParams("fast", 1000));
const high = sunHoursResolution(sunHoursQualityParams("high", 500));
const highEased = sunHoursResolution(sunHoursQualityParams("high", 1000));

describe("SunHoursGroundLegendList", () => {
  it("renders horizontal dock legend with five ticks and end units", () => {
    const html = renderToStaticMarkup(<SunHoursGroundLegendList maxHours={9.5} resolution={fast} compact />);
    expect(html).toContain("sun-hours-direct-legend-scale");
    expect(html).toContain("0 h");
    expect(html).toContain("9.5 h");
    expect(html).toContain("3 m grid · 15 min steps");
    expect(html).toContain("ground, roofs, walls · full daylight");
    expect(html).not.toContain("Eased");
    expect(html).not.toContain("Calculating");
    const liCount = (html.match(/<li>/g) ?? []).length;
    expect(liCount).toBe(5);
    expect(SUN_HOURS_DIRECT_LEGEND_DOCK_TICKS).toBe(5);
  });

  it("states the High grid and step", () => {
    const html = renderToStaticMarkup(<SunHoursGroundLegendList maxHours={9.5} resolution={high} compact />);
    expect(html).toContain("1 m grid · 5 min steps");
    expect(html).not.toContain("Eased");
    const sidebar = renderToStaticMarkup(<SunHoursGroundLegendList maxHours={9.5} resolution={high} />);
    expect(sidebar).toContain("Full daylight · 1 m grid · 5 min steps on ground, roofs, and walls.");
  });

  it("says when High eased the grid for a big cut", () => {
    const html = renderToStaticMarkup(<SunHoursGroundLegendList maxHours={9.5} resolution={highEased} compact />);
    expect(html).toContain("2 m grid · 5 min steps");
    expect(html).toContain("Eased from 1 m grid for this cut size");
  });

  it("shows a calculating status with the resolution being computed", () => {
    const html = renderToStaticMarkup(
      <SunHoursGroundLegendList maxHours={9.5} resolution={fast} compact pending pendingResolution={high} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Calculating 1 m grid · 5 min steps…");
    expect(html).toContain("3 m grid · 15 min steps");
  });

  it("shows only the title and calculating status before the first result", () => {
    const html = renderToStaticMarkup(
      <SunHoursGroundLegendList maxHours={0} resolution={null} compact pending pendingResolution={high} />,
    );
    expect(html).toContain("Direct Sun Hours");
    expect(html).toContain("Calculating 1 m grid · 5 min steps…");
    expect(html).not.toContain("sun-hours-direct-legend-scale");
    expect(html).not.toContain("full daylight");
  });

  it("formats dock ticks at quarter stops without units on mids", () => {
    expect(dockCompactTickLabels(9.5)).toEqual(["0 h", "2.4", "4.8", "7.1", "9.5 h"]);
  });
});
