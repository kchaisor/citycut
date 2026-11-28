// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DrawingPlan } from "./DrawingPlan";
import { planHeliodonForExport } from "../lib/planHeliodonExport";
import { solarSettingsForActiveAnalysis } from "../lib/solarStudyView";
import { getColour } from "../lib/colours";
import type { SolarViewSettings } from "./SolarHeliodon";
import type { ActiveAnalyses } from "../lib/sidebarSections";
import type { BuildingFeat, CityModel } from "../types";

const building = {
  id: 1,
  ring: [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]],
  holes: [],
  height: 20,
  use: "unclassified",
  source: "none",
} as unknown as BuildingFeat;

const model = {
  sideM: 200,
  center: { lat: -37.8045, lon: 145.0215 },
  buildings: [building],
  roads: [],
  areas: [],
  trees: [],
  terrain: null,
} as unknown as CityModel;

const date = { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22 };
const solarAnalyses = { solar: true, wind: false, view: false } as ActiveAnalyses;

function settings(patch: Partial<SolarViewSettings>): SolarViewSettings {
  return { ...date, hour: 12, minute: 0, showPath: false, castShadows: false, radiusFactor: 1, ...patch } as SolarViewSettings;
}

function drawing(solar: SolarViewSettings, kind: "site" | "figure-ground" = "site") {
  const dome = solarSettingsForActiveAnalysis(solar, solarAnalyses).showPath;
  const heliodon = planHeliodonForExport({
    showPath: dome,
    diagram: { ...date, hour: solar.hour, minute: solar.minute, sideM: model.sideM, radiusFactor: solar.radiusFactor },
  });
  return render(
    <DrawingPlan
      model={model}
      kind={kind}
      heliodon={heliodon}
      castShadows={solar.castShadows}
      shadowInput={{ ...date, hour: solar.hour, minute: solar.minute }}
      sunStudy={solar.sunStudy ? date : null}
    />,
  );
}

const domeParts = (container: HTMLElement) => ({
  group: container.querySelectorAll(".heliodon-plan").length,
  discs: container.querySelectorAll("[data-sun-hour]").length,
  paths: container.querySelectorAll(".heliodon-plan path").length,
  ticks: container.querySelectorAll(".heliodon-plan line").length,
});

const shadowPaths = (container: HTMLElement) =>
  [...container.querySelectorAll("svg.plan path")].filter(
    (el) => (el.getAttribute("fill") ?? "").toLowerCase() === getColour("--shadow-fill").toLowerCase(),
  ).length;

afterEach(cleanup);

describe("Drawing sun dome follows the Sun dome toggle", () => {
  for (const kind of ["site", "figure-ground"] as const) {
    it(`${kind}: hides discs, sun-path arcs, concentric rings and the degree ring with Sun dome off, even with the Plan Fan on`, () => {
      const { container } = drawing(settings({ showPath: false, sunStudy: true, castShadows: true }), kind);
      expect(domeParts(container)).toEqual({ group: 0, discs: 0, paths: 0, ticks: 0 });
      expect(container.textContent).not.toContain("Sun path diagram");
    });

    it(`${kind}: restores the dome when Sun dome is on`, () => {
      const { container } = drawing(settings({ showPath: true, sunStudy: kind === "site" }), kind);
      const parts = domeParts(container);
      expect(parts.group).toBe(1);
      expect(parts.paths).toBeGreaterThan(3);
      expect(parts.ticks).toBeGreaterThan(0);
      if (kind === "site") expect(parts.discs).toBeGreaterThan(0);
    });
  }

  it("keeps the north arrow with Sun dome off", () => {
    const { container } = drawing(settings({ showPath: false, sunStudy: true }));
    expect(container.querySelectorAll(".plan-north-arrow").length).toBe(1);
  });

  it("hides the dome when Solar Study itself is off, whatever the chip says", () => {
    const solar = settings({ showPath: true });
    expect(solarSettingsForActiveAnalysis(solar, { solar: false, wind: false, view: false } as ActiveAnalyses).showPath).toBe(false);
  });

  it("keeps Shadows and the Plan Fan independent of Sun dome", () => {
    const fanOff = drawing(settings({ showPath: false, sunStudy: true, castShadows: true })).container;
    const fanOffPaths = fanOff.querySelectorAll("svg.plan path").length;
    cleanup();
    const fanOn = drawing(settings({ showPath: true, sunStudy: true, castShadows: true })).container;
    expect(fanOn.querySelectorAll("svg.plan path").length - domeParts(fanOn).paths).toBe(fanOffPaths);
    cleanup();

    const shadowsOff = drawing(settings({ showPath: false, sunStudy: false, castShadows: true })).container;
    const shadowsOn = shadowPaths(shadowsOff);
    expect(shadowsOn).toBeGreaterThan(0);
    cleanup();
    const withDome = drawing(settings({ showPath: true, sunStudy: false, castShadows: true })).container;
    expect(shadowPaths(withDome)).toBe(shadowsOn);
    cleanup();

    const noShadows = drawing(settings({ showPath: true, sunStudy: false, castShadows: false })).container;
    expect(domeParts(noShadows).group).toBe(1);
    expect(shadowPaths(noShadows)).toBe(0);
    cleanup();

    const noFan = drawing(settings({ showPath: true, sunStudy: false, castShadows: true })).container;
    expect(domeParts(noFan).group).toBe(1);
    expect(domeParts(noFan).discs).toBe(0);
  });

  it("is wired through the same gate for the screen and the exports", () => {
    const hook = readFileSync(path.resolve(process.cwd(), "src/components/model/useModelPage.tsx"), "utf8");
    expect(hook).toContain("const sunDomeOn = solarSettingsForActiveAnalysis(solar, analyses).showPath;");
    expect(hook).toContain("planHeliodonForExport({ showPath: sunDomeOn, diagram: heliodonPlanDiagramBase() })");
    expect(hook).not.toContain("sunStudyDate,\n      diagram");
  });
});
