// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityModel } from "../types";
import { designWindsFor, findDesignWind } from "../lib/windDesignWinds";
import { sectorLabel, type WindPeriodStats } from "../lib/windRose";
import { windRoseSectorSharePct, windRoseSectorTip } from "../lib/windRoseChart";
import type { SiteWindSelection, WindRoseAsset } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { DEFAULT_WIND_SETTINGS, withDesignWind } from "../lib/windState";
import { siteWindSelection } from "../lib/windStation";
import { DesignWindPresets } from "./DesignWindPresets";
import { useWindPlan } from "./useWindPlan";
import { WindPlanOverlay, createWindPlanTransformStore } from "./WindPlanOverlay";
import { WindRosePanel } from "./WindRosePanel";
import { WindRoseSvgChart } from "./WindRoseSvgChart";

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

function Harness({ selection, initialDesign = null }: { selection: SiteWindSelection; initialDesign?: string | null }) {
  const [settings, setSettings] = useState(() =>
    initialDesign ? withDesignWind(DEFAULT_WIND_SETTINGS, initialDesign as `design-${string}`) : DEFAULT_WIND_SETTINGS,
  );
  const winds = designWindsFor(selection);
  const designWind = findDesignWind(winds, settings.designWind);
  const plan = useWindPlan({
    model: openModel,
    siteWind: selection,
    period: settings.period,
    designWind,
    designWinds: winds,
    clearDesignWind: () => setSettings((s) => ({ ...s, designWind: null })),
    active: true,
  });
  return (
    <>
      <DesignWindPresets winds={winds} selectedId={settings.designWind} onSelect={(id) => setSettings(withDesignWind(settings, id))} />
      <span data-testid="period">{settings.period}</span>
      <span data-testid="design">{settings.designWind ?? "none"}</span>
      <WindRosePanel selection={selection} period={settings.period} plan={plan} />
    </>
  );
}

function directionText(): string {
  const row = [...document.querySelectorAll(".wind-plan-row")].find((el) => el.querySelector("dt")?.textContent === "Direction");
  return row?.querySelector("dd")?.textContent ?? "";
}

function hit(sector: number): SVGPathElement {
  return document.querySelector<SVGPathElement>(`.wind-rose-hit[data-sector="${sector}"]`)!;
}

function rose(): SVGSVGElement {
  return document.querySelector<SVGSVGElement>(".wind-rose-picker-svg")!;
}

describe("plan wind rose picker", () => {
  afterEach(cleanup);

  it("drops the stepper and reads the direction out as label and heading", () => {
    render(<Harness selection={pyrmont} />);
    expect(screen.queryByRole("button", { name: "Previous wind direction" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next wind direction" })).toBeNull();
    expect(document.querySelector(".wind-plan-stepper")).toBeNull();
    act(() => {
      fireEvent.click(hit(2));
    });
    expect(directionText()).toBe("NE · 45°");
  });

  it("sets the analysed direction when a petal is clicked", () => {
    render(<Harness selection={pyrmont} />);
    act(() => {
      fireEvent.click(hit(9));
    });
    expect(directionText()).toBe("SSW · 202.5°");
    expect(window.__citycutWindPlan?.dirDeg).toBe(202.5);
    expect(rose().getAttribute("aria-valuetext")).toBe("SSW · 202.5°");
    expect(document.querySelector('.wind-rose-petal[data-sector="9"]')?.classList.contains("is-selected")).toBe(true);
    const bold = document.querySelector(".wind-rose-label.is-selected");
    expect(bold?.textContent).toBe("SSW");
    expect(bold?.getAttribute("font-weight")).toBe("800");
    expect(document.querySelector(".wind-rose-selected-arc")).toBeTruthy();
  });

  it("leaves a design wind for that direction in the current period when a petal is clicked", () => {
    render(<Harness selection={pyrmont} initialDesign="design-s" />);
    expect(screen.getByTestId("design").textContent).toBe("design-s");
    expect(directionText()).toBe("S · 180°");
    act(() => {
      fireEvent.click(hit(2));
    });
    expect(screen.getByTestId("design").textContent).toBe("none");
    expect(screen.getByTestId("period").textContent).toBe("annual");
    expect(directionText()).toBe("NE · 45°");
    expect(window.__citycutWindPlan?.season).toBe("annual");
    expect(window.__citycutWindPlan?.dirDeg).toBe(45);
    expect(screen.getByText("Season")).toBeTruthy();
  });

  it("steps one sector with Left and Right on the focused rose, leaving a design wind too", () => {
    render(<Harness selection={pyrmont} initialDesign="design-ne" />);
    const svg = rose();
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    svg.focus();
    act(() => {
      fireEvent.keyDown(svg, { key: "ArrowRight" });
    });
    expect(screen.getByTestId("design").textContent).toBe("none");
    expect(directionText()).toBe("ENE · 67.5°");
    act(() => {
      fireEvent.keyDown(svg, { key: "ArrowLeft" });
    });
    act(() => {
      fireEvent.keyDown(svg, { key: "ArrowLeft" });
    });
    expect(directionText()).toBe("NNE · 22.5°");
  });

  it("confirms the hovered sector with Enter and pins a tooltip with real station figures", () => {
    render(<Harness selection={pyrmont} />);
    act(() => {
      fireEvent.pointerOver(hit(2));
      fireEvent.pointerEnter(hit(2));
    });
    const stats = analyzeSiteWind(pyrmont, "annual")!;
    const tip = document.querySelector(".wind-rose-tip");
    expect(tip?.textContent).toMatch(/^NE · \d+% of hours · \d+\.\d m\/s median$/);
    expect(tip?.textContent).toContain(`${Math.round(windRoseSectorSharePct(stats, 2))}% of hours`);
    expect(document.querySelector(".wind-rose-picker")?.getAttribute("data-hovering")).toBe("true");
    expect(document.querySelector('.wind-rose-petal[data-sector="2"]')?.classList.contains("is-hovered")).toBe(true);
    act(() => {
      fireEvent.keyDown(rose(), { key: "Enter" });
    });
    expect(directionText()).toBe("NE · 45°");
  });

  it("keeps Comfort on all directions with no clickable rose", () => {
    function ComfortHarness() {
      const plan = useWindPlan({ model: openModel, siteWind: pyrmont, period: "annual", active: true });
      return (
        <>
          <button type="button" onClick={() => plan.setMode("comfort")}>
            Comfort
          </button>
          <WindRosePanel selection={pyrmont} period="annual" plan={plan} />
        </>
      );
    }
    render(<ComfortHarness />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Comfort" }));
    });
    expect(directionText()).toBe("All");
    expect(document.querySelector(".wind-rose-picker-svg")).toBeNull();
    expect(document.querySelector(".wind-rose-hit")).toBeNull();
  });
});

describe("wind rose hit targets", () => {
  afterEach(cleanup);

  const stats: WindPeriodStats = {
    period: "annual",
    totalHours: 1,
    calmHours: 0.1,
    calmPercent: 10,
    sectorFrequency: Array.from({ length: 16 }, (_, s) => (s === 5 ? 0 : 1 / 15)),
    prevailingSector: 0,
    prevailingLabel: "N",
    prevailingMedianKmh: 10,
    sectorSpeedBins: Array.from({ length: 16 }, (_, s) => (s === 5 ? [0, 0, 0] : [0.03, 0.02, 0.01])),
  };

  it("covers the full sector out to the outer ring, empty sectors included", () => {
    const onSelect = vi.fn();
    render(
      <WindRoseSvgChart
        stats={stats}
        hubFill="var(--wind-rose-card-surface)"
        picker={{ selected: 0, onSelect, onStep: () => {}, tip: (s) => windRoseSectorTip(s, 0, null) }}
      />,
    );
    expect(document.querySelectorAll(".wind-rose-hit")).toHaveLength(16);
    expect(document.querySelectorAll('.wind-rose-petal[data-sector="5"] .wind-rose-petal-band')).toHaveLength(0);
    const empty = hit(5);
    expect(empty.getAttribute("d")).toMatch(/^M 120 128 /);
    expect(empty.getAttribute("d")).toContain("A 90 90");
    act(() => {
      fireEvent.click(empty);
    });
    expect(onSelect).toHaveBeenCalledWith(5);
    act(() => {
      fireEvent.pointerOver(empty);
      fireEvent.pointerEnter(empty);
    });
    expect(document.querySelector(".wind-rose-tip")?.textContent).toBe(`${sectorLabel(5)} · 0% of hours · no wind`);
  });

  it("leaves the non-plan rose static and hidden from assistive tech", () => {
    const { container } = render(<WindRoseSvgChart stats={stats} hubFill="var(--wind-rose-card-surface)" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("tabindex")).toBeNull();
    expect(container.querySelector(".wind-rose-hit")).toBeNull();
  });
});

describe("plan wind overlay", () => {
  afterEach(cleanup);

  it("draws no wind arrow and no Wind from chip on the speed map", () => {
    vi.stubGlobal(
      "Path2D",
      class {
        moveTo() {}
        lineTo() {}
        closePath() {}
      },
    );
    function OverlayHarness() {
      const plan = useWindPlan({ model: openModel, siteWind: pyrmont, period: "annual", active: true });
      const [store] = useState(() => {
        const s = createWindPlanTransformStore();
        s.set({ ox: 400, oy: 300, exX: 1, exY: 0, enX: 0, enY: -1 });
        return s;
      });
      return <WindPlanOverlay model={openModel} plan={plan} store={store} />;
    }
    const { container } = render(<OverlayHarness />);
    expect(container.querySelector(".wind-plan-overlay")?.getAttribute("data-wind-plan-mode")).toBe("speed");
    expect(container.querySelector(".wind-plan-arrow")).toBeNull();
    expect(container.querySelector(".wind-plan-arrow-chip")).toBeNull();
    expect(container.textContent).not.toContain("Wind from");
    vi.unstubAllGlobals();
  });

  it("styles the rose states from tokens with a reduced-motion opt-out", () => {
    const css = readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    expect(css).not.toContain(".wind-plan-arrow");
    expect(css).not.toContain(".wind-plan-info");
    expect(css).toMatch(/\.wind-rose-petal \{\s*opacity: 1;\s*transition: opacity 120ms ease-out;/);
    expect(css).toMatch(/\.wind-rose-picker\[data-hovering\] \.wind-rose-petal:not\(\.is-hovered\) \{\s*opacity: 0\.45;/);
    expect(css).toMatch(/\.wind-rose-petal\.is-hovered \.wind-rose-petal-outline \{\s*stroke: var\(--ink\);\s*stroke-width: 1\.5px;/);
    expect(css).toMatch(/\.wind-rose-selected-arc \{\s*fill: var\(--accent\);\s*stroke: var\(--ink\);\s*stroke-width: 1px;/);
    expect(css).toMatch(/\.wind-rose-picker-svg:focus-visible \{\s*outline: 2px solid var\(--ink\);\s*outline-offset: 2px;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.wind-rose-petal \{\s*transition: none;/);
  });
});
