// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityModel } from "../types";
import { designWindsFor, findDesignWind, headingPeriodStats } from "../lib/windDesignWinds";
import { sectorLabel } from "../lib/windRose";
import type { WindRoseAsset } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { DEFAULT_WIND_SETTINGS, withDesignWind, type WindViewSettings } from "../lib/windState";
import { siteWindSelection } from "../lib/windStation";
import { toggleWindRoseChip, windRoseCardOn, windRoseChipOn } from "./model/windRoseCard";
import { useWindPlan } from "./useWindPlan";
import { WindRosePanel } from "./WindRosePanel";

const asset = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/wind/australia-tmyx.json"), "utf8"),
) as WindRoseAsset;
const pyrmont = siteWindSelection(asset, -33.86627, 151.18389)!;

const openModel: CityModel = {
  placeLabel: "Test",
  center: { lon: 151.18389, lat: -33.86627 },
  sideM: 240,
  layers: { buildings: true, roads: true, waterGreen: true, trees: true },
  buildings: [],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "",
};

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

function hit(sector: number): SVGPathElement {
  return document.querySelector<SVGPathElement>(`.wind-rose-hit[data-sector="${sector}"]`)!;
}

function FlowHarness({ initialDesign = null, flowHeading = true }: { initialDesign?: string | null; flowHeading?: boolean }) {
  const [settings, setSettings] = useState<WindViewSettings>(() =>
    initialDesign
      ? withDesignWind({ ...DEFAULT_WIND_SETTINGS, enabled: true }, initialDesign as `design-${string}`)
      : { ...DEFAULT_WIND_SETTINGS, enabled: true },
  );
  const winds = designWindsFor(pyrmont);
  const designWind = findDesignWind(winds, settings.designWind);
  const plan = useWindPlan({
    model: openModel,
    siteWind: pyrmont,
    period: settings.period,
    designWind,
    designWinds: winds,
    clearDesignWind: () => setSettings((s) => ({ ...s, designWind: null })),
    active: false,
  });
  const flowStats = headingPeriodStats(analyzeSiteWind(pyrmont, settings.period)!, designWind, plan.sector);
  return (
    <>
      <span data-testid="design">{settings.designWind ?? "none"}</span>
      <span data-testid="flow-sector">{flowStats.prevailingSector}</span>
      <div className="wind-rose-analysis-card hud-card">
        <WindRosePanel selection={pyrmont} period={settings.period} plan={plan} flowHeading={flowHeading} />
      </div>
    </>
  );
}

describe("console Wind Rose chip and the left card", () => {
  const card = (windSettings: WindViewSettings, planActive = false) =>
    windRoseCardOn({ leftOpen: "analysis", tab: "3d", analysisKind: "wind", siteWind: pyrmont, windSettings, planActive });

  it("shows the left card exactly when the chip is pressed, and the chip toggles both ways", () => {
    const on: WindViewSettings = { ...DEFAULT_WIND_SETTINGS, enabled: true, showRose: true };
    expect(windRoseChipOn(on)).toBe(true);
    expect(card(on)).toBe(true);
    const off = toggleWindRoseChip(on);
    expect(off.showRose).toBe(false);
    expect(windRoseChipOn(off)).toBe(false);
    expect(card(off)).toBe(false);
    const back = toggleWindRoseChip(off);
    expect(windRoseChipOn(back)).toBe(true);
    expect(card(back)).toBe(true);
    const flowOff: WindViewSettings = { ...DEFAULT_WIND_SETTINGS, enabled: false, showRose: true };
    expect(windRoseChipOn(toggleWindRoseChip(flowOff))).toBe(true);
  });

  it("keeps the plan card regardless of the chip and hides it outside wind analysis", () => {
    const off: WindViewSettings = { ...DEFAULT_WIND_SETTINGS, enabled: true, showRose: false };
    expect(card(off, true)).toBe(true);
    const on: WindViewSettings = { ...DEFAULT_WIND_SETTINGS, enabled: true, showRose: true };
    expect(windRoseCardOn({ leftOpen: "analysis", tab: "satellite", analysisKind: "wind", siteWind: pyrmont, windSettings: on, planActive: false })).toBe(false);
    expect(windRoseCardOn({ leftOpen: "analysis", tab: "3d", analysisKind: "solar", siteWind: pyrmont, windSettings: on, planActive: false })).toBe(false);
  });

  it("drives aria-pressed and the card from the same rule and mounts no 3D rose overlay", () => {
    const footer = source("src/components/model/ModelPageViewportFooter.tsx");
    expect(footer).toContain("aria-pressed={windRoseChipOn(windSettings)}");
    expect(footer).toContain("toggleWindRoseChip(windSettings)");
    expect(source("src/components/model/ModelPageView.tsx")).toContain("windRoseCardOn(");
    const tabs = source("src/components/model/ModelPageViewportTabs.tsx");
    expect(tabs).not.toContain("WindRoseOverlay");
    expect(source("src/index.css")).not.toContain(".wind-rose-overlay");
  });
});

describe("3D Wind Flow rose", () => {
  afterEach(cleanup);

  it("selects a petal like plan Wind speed and turns the 3D flow with it", () => {
    render(<FlowHarness />);
    expect(document.querySelector(".wind-rose-panel.is-flow .wind-rose-picker-svg")).toBeTruthy();
    act(() => {
      fireEvent.click(hit(9));
    });
    expect(document.querySelector('.wind-rose-petal[data-sector="9"]')?.classList.contains("is-selected")).toBe(true);
    expect(document.querySelector(".wind-rose-selected-arc")).toBeTruthy();
    expect(screen.getByTestId("flow-sector").textContent).toBe("9");
    act(() => {
      fireEvent.pointerOver(hit(4));
      fireEvent.pointerEnter(hit(4));
    });
    expect(document.querySelector(".wind-rose-tip")?.textContent).toContain(sectorLabel(4));
  });

  it("clears a design wind the same way plan selectSector does", () => {
    render(<FlowHarness initialDesign="design-s" />);
    expect(screen.getByTestId("design").textContent).toBe("design-s");
    expect(screen.getByTestId("flow-sector").textContent).toBe("8");
    act(() => {
      fireEvent.click(hit(2));
    });
    expect(screen.getByTestId("design").textContent).toBe("none");
    expect(screen.getByTestId("flow-sector").textContent).toBe("2");
  });

  it("stays static when 3D Wind Flow is not on", () => {
    render(<FlowHarness flowHeading={false} />);
    expect(document.querySelector(".wind-rose-picker-svg")).toBeNull();
    expect(document.querySelector(".wind-rose-hit")).toBeNull();
  });

  it("uses the m/s velocity legend, not the km/h bar or the sheltered/open legend", () => {
    render(<FlowHarness />);
    const panel = document.querySelector(".wind-rose-panel.is-flow")!;
    expect(panel.querySelector(".wind-plan-velocity .wind-plan-legend-title")?.textContent).toBe("Velocity (m/s)");
    expect(panel.querySelector(".wind-speed-step-legend")).toBeNull();
    expect(panel.querySelector(".ground-wind-legend")).toBeNull();
    expect(panel.textContent).not.toContain("km/h");
    expect(panel.textContent).not.toContain("sheltered");
    expect(panel.textContent).not.toContain("Pedestrian comfort");
    expect(panel.querySelector("details.wind-rose-nearby")).toBeTruthy();
    expect(panel.textContent).toContain("Regional station wind, not site wind.");
  });
});

describe("intro cut ring guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays on a first visit and stays hidden after the intro finished for that cut", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/130" });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { computeIntroCutRingOpacity, introCutKey, introPendingFor, markIntroPlayed } = await import("./Scene3D");
    const cut = introCutKey({ center: { lat: -33.86627, lon: 151.18389 }, sideM: 240 });
    const other = introCutKey({ center: { lat: -33.8, lon: 151.1 }, sideM: 240 });
    expect(introPendingFor(cut)).toBe(true);
    expect(computeIntroCutRingOpacity(0)).toBe(1);
    markIntroPlayed(cut);
    expect(introPendingFor(cut)).toBe(false);
    expect(introPendingFor(cut)).toBe(false);
    expect(introPendingFor(other)).toBe(true);
    expect(computeIntroCutRingOpacity(10)).toBe(0);
  });

  it("builds the ring and stagger only while the intro is pending for the cut", () => {
    const scene = source("src/components/Scene3D.tsx");
    expect(scene).toContain("const introStagger = introPendingFor(cutKey);");
    expect(scene).toContain("if (!introPendingFor(cutKey) || targets.length === 0) {");
    expect(scene).toContain("markIntroPlayed(intro.cutKey);");
    expect(scene).toContain("introEnabled={introOn}");
  });
});
