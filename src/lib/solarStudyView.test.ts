import { describe, expect, it } from "vitest";
import { NO_ANALYSES, SITE_ANALYSIS_KINDS, analysesOf } from "./sidebarSections";
import {
  solarSettingsForActiveAnalysis,
  solarSettingsOnStudyStart,
  solarStudyViewActive,
  windDiagramActive,
  windFlowActive,
} from "./solarStudyView";
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
  it("is on whenever Solar Study is on, whatever else is on with it", () => {
    expect(solarStudyViewActive(analysesOf("solar"))).toBe(true);
    expect(solarStudyViewActive(analysesOf("solar", "wind"))).toBe(true);
    expect(solarStudyViewActive(analysesOf("solar", "wind", "view"))).toBe(true);
    expect(solarStudyViewActive(NO_ANALYSES)).toBe(false);
    for (const kind of SITE_ANALYSIS_KINDS.filter((kind) => kind !== "solar")) {
      expect(solarStudyViewActive(analysesOf(kind))).toBe(false);
    }
  });
});

describe("solarSettingsForActiveAnalysis", () => {
  it("keeps the 3D sun dome while Solar Study is on", () => {
    expect(solarSettingsForActiveAnalysis(domeOn, analysesOf("solar")).showPath).toBe(true);
    expect(solarSettingsForActiveAnalysis(domeOn, analysesOf("solar", "wind")).showPath).toBe(true);
  });

  it("hides the 3D sun dome under Wind Rose alone even when the dome chip was left on", () => {
    expect(solarSettingsForActiveAnalysis(domeOn, analysesOf("wind")).showPath).toBe(false);
  });

  it("hides the 3D sun dome under Viewshed Walk and with no analysis selected", () => {
    expect(solarSettingsForActiveAnalysis(domeOn, analysesOf("view")).showPath).toBe(false);
    expect(solarSettingsForActiveAnalysis(domeOn, NO_ANALYSES).showPath).toBe(false);
  });

  it("leaves every other solar setting alone", () => {
    const gated = solarSettingsForActiveAnalysis({ ...domeOn, castShadows: true }, analysesOf("wind"));
    expect(gated).toEqual({ ...domeOn, castShadows: true, showPath: false });
  });
});

describe("windFlowActive", () => {
  it("runs the ground-flow while Wind Rose is on and 3D Wind Flow is enabled, with or without Solar Study", () => {
    expect(windFlowActive(true, analysesOf("wind"))).toBe(true);
    expect(windFlowActive(true, analysesOf("wind", "solar"))).toBe(true);
    expect(windFlowActive(false, analysesOf("wind"))).toBe(false);
    expect(windFlowActive(true, analysesOf("solar"))).toBe(false);
    expect(windFlowActive(true, analysesOf("view"))).toBe(false);
    expect(windFlowActive(true, NO_ANALYSES)).toBe(false);
  });

  it("keeps the ground-flow and the diagram arrows on separate switches", () => {
    const wind = analysesOf("wind", "solar");
    expect([windFlowActive(false, wind), windDiagramActive(true, wind)]).toEqual([false, true]);
    expect([windFlowActive(true, wind), windDiagramActive(false, wind)]).toEqual([true, false]);
    expect(windDiagramActive(true, analysesOf("solar"))).toBe(false);
  });
});

describe("solarSettingsOnStudyStart", () => {
  it("turns Shadows and the 3D sun dome on and leaves Sun hours and the date alone", () => {
    const off: SolarViewSettings = { ...domeOn, showPath: false, castShadows: false, sunHours: false };
    expect(solarSettingsOnStudyStart(off)).toEqual({ ...off, showPath: true, castShadows: true });
    const sunHoursOn: SolarViewSettings = { ...off, sunHours: true };
    expect(solarSettingsOnStudyStart(sunHoursOn).sunHours).toBe(true);
  });

  it("returns the same settings when both are already on", () => {
    const on: SolarViewSettings = { ...domeOn, castShadows: true };
    expect(solarSettingsOnStudyStart(on)).toBe(on);
  });
});
