import { describe, expect, it } from "vitest";
import { placeWindPlanLegend, type WindPlanLegendInput } from "./windPlanLegendLayout";

const base: WindPlanLegendInput = {
  viewW: 1440,
  viewH: 900,
  cardW: 100,
  chromeH: 50,
  inset: 14,
  gap: 8,
  topLimit: 68,
  barMax: 200,
  barMin: 96,
  inspector: { left: 1158, top: 68, right: 1426, bottom: 450 },
  floors: [
    { left: 360, top: 803, right: 1080, bottom: 888 },
    { left: 1366, top: 826, right: 1422, bottom: 882 },
  ],
};

describe("plan wind velocity legend placement", () => {
  it("sits in the lower right, above the compass and below Site Intelligence", () => {
    const at = placeWindPlanLegend(base);
    expect(at).toEqual({ right: 14, bottom: 900 - 818, barPx: 200 });
    const top = 900 - at.bottom - base.chromeH - at.barPx;
    expect(top).toBeGreaterThanOrEqual(450 + 8);
  });

  it("shortens the bar when Site Intelligence is taller", () => {
    const at = placeWindPlanLegend({ ...base, inspector: { ...base.inspector!, bottom: 620 } });
    expect(at.barPx).toBe(818 - 628 - 50);
  });

  it("moves left of Site Intelligence when it reaches the compass", () => {
    const at = placeWindPlanLegend({ ...base, inspector: { ...base.inspector!, bottom: 834 } });
    expect(at.right).toBe(1440 - 1150);
    expect(at.bottom).toBe(900 - (803 - 8));
    expect(at.barPx).toBe(200);
  });
});
