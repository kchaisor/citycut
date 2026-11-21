import { describe, expect, it } from "vitest";
import { HELIODON_LIFT_M } from "./heliodonGeometry";
import { sunDomeRadiusM } from "./heliodonRadius";
import {
  SUN_DOME_HOUR_LABELS,
  easeInOutCubic,
  hudSafeArea,
  sunDomeArcs,
  sunDomeBearingLabels,
  sunDomeBounds,
  sunDomeDateLabel,
  sunDomeHourLabel,
  sunDomeKeyItems,
} from "./heliodonSunDome";

describe("sun dome labels", () => {
  it("writes dates day-first", () => {
    expect(sunDomeDateLabel(6, 21)).toBe("21 Jun");
    expect(sunDomeDateLabel(12, 22)).toBe("22 Dec");
    expect(sunDomeDateLabel(3, 4)).toBe("4 Mar");
  });

  it("labels the solstice arcs 21 Jun and 22 Dec, and leaves the equinox to the key", () => {
    const labels = sunDomeArcs({ month: 3, day: 4 })
      .filter((arc) => !arc.selected)
      .map((arc) => arc.dateLabel);
    expect(labels).toEqual(["21 Jun", "22 Dec", null]);
    expect(labels).not.toContain("Jun 21");
    expect(labels).not.toContain("Dec 22");
  });

  it("puts 09h, 12h and 15h on the selected arc only", () => {
    expect(SUN_DOME_HOUR_LABELS.map(sunDomeHourLabel)).toEqual(["09h", "12h", "15h"]);
    const arcs = sunDomeArcs({ month: 3, day: 4 });
    expect(arcs.filter((arc) => arc.hourLabels.length > 0)).toEqual([arcs[0]]);
    expect(arcs[0]!.selected).toBe(true);
    expect(arcs[0]!.hourLabels).toEqual([9, 12, 15]);
  });

  it("draws a selected key date once, in the selected style", () => {
    const arcs = sunDomeArcs({ month: 12, day: 22 });
    expect(arcs.filter((arc) => arc.month === 12 && arc.day === 22)).toHaveLength(1);
    expect(arcs[0]).toMatchObject({ selected: true, dateLabel: "22 Dec" });
    expect(arcs[0]!.line).toMatchObject({ widthPx: 2, ink: "--ink", dashPx: null });
  });

  it("uses at most three line styles for arcs and hour lines", () => {
    const arcs = sunDomeArcs({ month: 3, day: 4 });
    const weights = new Set(arcs.map((arc) => `${arc.line.widthPx}:${arc.line.ink}:${arc.line.opacity}`));
    weights.add("0.75:--ink:0.35");
    expect(weights.size).toBe(3);
    expect(arcs.find((arc) => arc.month === 6)!.line.dashPx).toEqual([6, 4]);
    expect(arcs.find((arc) => arc.month === 12)!.line.dashPx).toEqual([2, 3]);
    expect(arcs.find((arc) => arc.month === 9)!.line.dashPx).toEqual([2, 4]);
  });

  it("labels bearings every 30° with N/E/S/W", () => {
    expect(sunDomeBearingLabels().map((label) => label.text)).toEqual([
      "N", "30", "60", "E", "120", "150", "S", "210", "240", "W", "300", "330",
    ]);
  });

  it("keys the selected date, the other key dates, hour lines and the sun", () => {
    const labels = sunDomeKeyItems({ month: 12, day: 22 }).map((item) => ("strong" in item && item.strong ? `${item.strong} ${item.label}` : item.label));
    expect(labels).toEqual(["22 Dec selected", "21 Jun", "Equinox", "Hours", "Sun"]);
  });
});

describe("sun dome camera fit", () => {
  const viewport = { left: 0, top: 0, right: 1440, bottom: 900 };

  it("shrinks the viewport away from HUD panels plus 16 px", () => {
    const safe = hudSafeArea(viewport, [
      { left: 0, top: 0, right: 1440, bottom: 56 },
      { left: 12, top: 72, right: 300, bottom: 700 },
      { left: 1120, top: 72, right: 1428, bottom: 820 },
      { left: 320, top: 810, right: 1100, bottom: 886 },
    ]);
    expect(safe).toEqual({ left: 316, top: 72, right: 1104, bottom: 794 });
  });

  it("ignores panels outside the viewport", () => {
    expect(hudSafeArea(viewport, [{ left: 1500, top: 0, right: 1600, bottom: 100 }])).toEqual(viewport);
  });

  it("frames the dome radius and height, not the whole cut", () => {
    const sideM = 1000;
    const radiusM = sunDomeRadiusM(sideM);
    expect(radiusM).toBeLessThan(sideM / 2);
    const bounds = sunDomeBounds({ lat: -37.81, lon: 144.96, year: 2026, selected: { month: 12, day: 22 }, radiusM, groundY: 10 });
    expect(bounds.min).toEqual([-radiusM, 10, -radiusM]);
    expect(bounds.max[0]).toBe(radiusM);
    expect(bounds.max[2]).toBe(radiusM);
    expect(bounds.max[1]).toBeGreaterThan(10 + HELIODON_LIFT_M + radiusM * 0.9);
    expect(bounds.max[1]).toBeLessThanOrEqual(10 + HELIODON_LIFT_M + radiusM);
  });

  it("eases in and out", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(1)).toBe(1);
  });
});
