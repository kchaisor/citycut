import { describe, expect, it } from "vitest";
import { SITE_ANALYSIS_KINDS } from "./sidebarSections";
import { solarSettingsForActiveAnalysis, solarStudyViewActive, windFlowActive } from "./solarStudyView";
import type { SolarViewSettings } from "../components/SolarHeliodon";

const domeOn: SolarViewSettings = {
  showPath: true,
  castShadows: false,
  radiusFactor: 1.75,
  year: 2026,
  month: 9,
  day: 22,
  hour: 15,
  minute: 0,
};

describe("solarStudyViewActive", () => {
  it("is on only while Solar Study is the active analysis", () => {
    expect(solarStudyViewActive("solar")).toBe(true);
    expect(solarStudyViewActive(null)).toBe(false);
    for (const kind of SITE_ANALYSIS_KINDS.filter((kind) => kind !== "solar")) {
      expect(solarStudyViewActive(kind)).toBe(false);
    }
  });
});

describe("solarSettingsForActiveAnalysis", () => {
  it("keeps the 3D sun dome while Solar Study is on", () => {
    expect(solarSettingsForActiveAnalysis(domeOn, "solar").showPath).toBe(true);
  });

  it("hides the 3D sun dome under Wind Rose even when the dome chip was left on", () => {
    expect(solarSettingsForActiveAnalysis(domeOn, "wind").showPath).toBe(false);
  });

  it("hides the 3D sun dome under Viewshed Walk and with no analysis selected", () => {
    expect(solarSettingsForActiveAnalysis(domeOn, "view").showPath).toBe(false);
    expect(solarSettingsForActiveAnalysis(domeOn, null).showPath).toBe(false);
  });

  it("leaves every other solar setting alone", () => {
    const gated = solarSettingsForActiveAnalysis({ ...domeOn, castShadows: true }, "wind");
    expect(gated).toEqual({ ...domeOn, castShadows: true, showPath: false });
  });
});

describe("windFlowActive", () => {
  it("runs wind streaks only while Wind Rose is active and wind is enabled", () => {
    expect(windFlowActive(true, "wind")).toBe(true);
    expect(windFlowActive(false, "wind")).toBe(false);
    expect(windFlowActive(true, "solar")).toBe(false);
    expect(windFlowActive(true, "view")).toBe(false);
    expect(windFlowActive(true, null)).toBe(false);
  });
});
