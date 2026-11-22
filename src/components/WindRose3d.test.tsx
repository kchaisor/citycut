// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { designWindsFor, findDesignWind, headingPeriodStats } from "../lib/windDesignWinds";
import { sectorLabel } from "../lib/windRose";
import type { WindRoseAsset } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { DEFAULT_WIND_SETTINGS, withDesignWind, type WindViewSettings } from "../lib/windState";
import { siteWindSelection } from "../lib/windStation";
import type { ActiveAnalysis } from "../lib/sidebarSections";
import { windRoseCardOn } from "./model/windRoseCard";
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

describe("the wind rose card", () => {
  const card = (tab: string, analysisKind: ActiveAnalysis) => windRoseCardOn({ tab, analysisKind, siteWind: pyrmont });

  it("shows in wind analysis on the 3D and Drawing tabs", () => {
    expect(card("3d", "wind")).toBe(true);
    expect(card("drawing", "wind")).toBe(true);
  });

  it("hides the card outside wind analysis and on Satellite", () => {
    expect(card("satellite", "wind")).toBe(false);
    expect(card("3d", "solar")).toBe(false);
    expect(card("3d", null)).toBe(false);
    expect(windRoseCardOn({ tab: "3d", analysisKind: "wind", siteWind: null })).toBe(false);
  });

  it("has no Wind Rose chip and mounts no floating rose overlay", () => {
    expect(source("src/components/model/ModelPageViewportFooter.tsx")).not.toMatch(/windRoseChipOn|toggleWindRoseChip|showRose/);
    expect(source("src/components/model/ModelPageSidebar.tsx")).toContain("windRoseCardOn(");
    expect(source("src/components/model/ModelPageViewportTabs.tsx")).not.toContain("WindRoseOverlay");
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
    expect(panel.querySelector(".wind-rose-footnote")?.textContent).toContain("Regional station, not site wind · TMYx ↗");
    expect(panel.querySelector(".wind-rose-calm-caption")).toBeNull();
    expect(panel.querySelector(".wind-rose-chart .wind-rose-calm")?.textContent).toMatch(/^Calm \d+\.\d%$/);
  });
});

describe("intro cut ring guard", () => {
  it("fades the cut ring out over the intro", async () => {
    const { computeIntroCutRingOpacity } = await import("./Scene3D");
    expect(computeIntroCutRingOpacity(0)).toBe(1);
    expect(computeIntroCutRingOpacity(10)).toBe(0);
  });

  it("builds the ring and stagger only while the intro has not played for this cut", () => {
    const scene = source("src/components/Scene3D.tsx");
    expect(scene).toContain("const introStagger = shouldRunIntroTransition() && !introSkip;");
    expect(scene).toContain("if (!shouldRunIntroTransition() || introSkip || targets.length === 0) {");
    expect(scene).toContain("if (introPlayed) markIntroPlayedForCut(introPlayed, intro.cutKey);");
    expect(scene).toContain("introEnabled={!introSkip}");
  });
});
