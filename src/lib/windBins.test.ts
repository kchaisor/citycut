import { describe, expect, it } from "vitest";
import {
  WIND_SPEED_CONSOLE_CHIP_LABELS,
  windRoseCalmCaption,
  windSpeedBinRangeLabel,
  windSpeedLegendTickLine,
} from "./windBins";

describe("windBins", () => {
  it("card legend ticks and console band labels share the same speed breakpoints", () => {
    const ticks = windSpeedLegendTickLine();
    expect(ticks).toBe("2 · 10 · 20 · 30 · 40+ km/h");
    expect(windSpeedBinRangeLabel(0)).toBe(WIND_SPEED_CONSOLE_CHIP_LABELS[0]);
    expect(windSpeedBinRangeLabel(4)).toBe(WIND_SPEED_CONSOLE_CHIP_LABELS[4]);
    expect(WIND_SPEED_CONSOLE_CHIP_LABELS[0]).toMatch(/^2–10 km\/h$/);
  });

  it("calm-heavy caption explains petal share", () => {
    expect(windRoseCalmCaption(5.1)).toBe("Calm 5.1%");
    expect(windRoseCalmCaption(72)).toBe("Calm 72.0% · petals show the other 28.0%");
  });
});