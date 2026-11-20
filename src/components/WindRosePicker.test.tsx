// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityModel } from "../types";
import { designWindsFor, findDesignWind } from "../lib/windDesignWinds";
import { sectorLabel, type WindPeriodStats } from "../lib/windRose";
import {
  DEFAULT_WIND_ROSE_LAYOUT,
  windRoseSectorPoint,
  windRoseSectorSharePct,
  windRoseSectorTip,
} from "../lib/windRoseChart";
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

function computedOpacity(el: Element): string {
  el.parentNode!.insertBefore(el, el.nextSibling);
  return getComputedStyle(el).opacity;
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

  it("draws the selected mark as a 22.5° arc on the ring with the bold label at R+14", () => {
    render(<Harness selection={pyrmont} />);
    act(() => {
      fireEvent.click(hit(2));
    });
    const { cx, cy, outerR } = DEFAULT_WIND_ROSE_LAYOUT;
    const d = document.querySelector(".wind-rose-selected-arc")!.getAttribute("d")!;
    expect(d).toMatch(new RegExp(`^M [\\d.]+ [\\d.]+ A ${outerR} ${outerR} 0 0 1 [\\d.]+ [\\d.]+$`));
    expect(d).not.toContain("L");
    expect(d).not.toContain("Z");
    const nums = d.match(/-?[\d.]+/g)!.map(Number);
    const ends = [
      [nums[0]!, nums[1]!],
      [nums[7]!, nums[8]!],
    ];
    for (const [x, y] of ends) expect(Math.hypot(x! - cx, y! - cy)).toBeCloseTo(outerR, 6);
    const bearing = ([x, y]: number[]) => (Math.atan2(x! - cx, cy - y!) * 180) / Math.PI;
    expect(bearing(ends[0]!)).toBeCloseTo(45 - 11.25, 6);
    expect(bearing(ends[1]!)).toBeCloseTo(45 + 11.25, 6);
    const edge = document.querySelector(".wind-rose-selected-arc-edge")!.getAttribute("d")!;
    expect(edge).toContain(`A ${outerR} ${outerR} 0 0 1`);
    expect(edge).not.toBe(d);
    const label = document.querySelector<SVGTextElement>(".wind-rose-label.is-selected")!;
    expect(label.textContent).toBe("NE");
    const at = windRoseSectorPoint(DEFAULT_WIND_ROSE_LAYOUT, 2, outerR + 14);
    expect(Number(label.getAttribute("x"))).toBeCloseTo(at.x, 6);
    expect(Number(label.getAttribute("y"))).toBeCloseTo(at.y, 6);
    expect(label.getAttribute("text-anchor")).toBe("middle");
    act(() => {
      fireEvent.click(hit(4));
    });
    const east = document.querySelectorAll(".wind-rose-label.is-selected");
    expect(east).toHaveLength(1);
    expect(east[0]!.textContent).toBe("E");
    expect(Number(east[0]!.getAttribute("x"))).toBeCloseTo(cx + outerR + 14, 6);
    expect([...document.querySelectorAll(".wind-rose-label")].filter((el) => el.textContent === "E")).toHaveLength(1);
  });

  it("dims the other petals to 0.45 while a sector is hovered and restores them on leave", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    document.head.appendChild(style);
    render(<Harness selection={pyrmont} />);
    const petal = (s: number) => document.querySelector<SVGGElement>(`.wind-rose-petal[data-sector="${s}"]`)!;
    expect(petal(2).contains(hit(2))).toBe(true);
    expect(computedOpacity(petal(7))).toBe("1");
    act(() => {
      fireEvent.pointerOver(hit(2));
      fireEvent.pointerEnter(hit(2));
    });
    expect(computedOpacity(petal(2))).toBe("1");
    for (const s of [0, 7, 9, 15]) expect(computedOpacity(petal(s))).toBe("0.45");
    act(() => {
      fireEvent.pointerOut(hit(2));
      fireEvent.pointerLeave(document.querySelector(".wind-rose-picker")!);
    });
    expect(document.querySelector(".wind-rose-picker")?.getAttribute("data-hovering")).toBeNull();
    for (const s of [0, 2, 7]) expect(computedOpacity(petal(s))).toBe("1");
    expect(document.querySelector(".wind-rose-tip")).toBeNull();
    style.remove();
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
    expect(tip?.textContent).toMatch(/^NE · Annual · \d+% of hours · \d+\.\d m\/s$/);
    expect(tip?.textContent).not.toContain("median");
    expect(tip?.textContent).toContain(`${Math.round(windRoseSectorSharePct(stats, 2))}% of hours`);
    expect(document.querySelector(".wind-rose-picker")?.getAttribute("data-hovering")).toBe("true");
    expect(document.querySelector('.wind-rose-petal[data-sector="2"]')?.classList.contains("is-hovered")).toBe(true);
    act(() => {
      fireEvent.keyDown(rose(), { key: "Enter" });
    });
    expect(directionText()).toBe("NE · 45°");
  });

  it("uses the design wind's figures in the tooltip for its own sector, period figures elsewhere", () => {
    render(<Harness selection={pyrmont} initialDesign="design-s" />);
    const design = findDesignWind(designWindsFor(pyrmont), "design-s")!;
    act(() => {
      fireEvent.pointerOver(hit(design.sector));
      fireEvent.pointerEnter(hit(design.sector));
    });
    expect(document.querySelector(".wind-rose-tip")?.textContent).toBe(
      `${sectorLabel(design.sector)} · ${Math.round(design.sharePct)}% of hours · ${design.referenceMs.toFixed(1)} m/s`,
    );
    act(() => {
      fireEvent.pointerOver(hit(2));
      fireEvent.pointerEnter(hit(2));
    });
    expect(document.querySelector(".wind-rose-tip")?.textContent).toMatch(/^NE · Annual · \d+% of hours · \d+\.\d m\/s$/);
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
    expect(empty.getAttribute("d")).toContain("A 91 91");
    expect(document.querySelector('.wind-rose-petal[data-sector="5"]')?.contains(empty)).toBe(true);
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
    expect(css).toMatch(/\.wind-rose-picker-svg:has\(\.wind-rose-petal:hover\) \.wind-rose-petal:not\(:hover\) \{\s*opacity: 0\.45;/);
    expect(css).toMatch(/\.wind-rose-petal\.is-hovered \.wind-rose-petal-outline \{\s*stroke: var\(--ink\);\s*stroke-width: 1\.5px;/);
    expect(css).toMatch(/\.wind-rose-selected-arc-edge \{\s*fill: none;\s*stroke: var\(--ink\);\s*stroke-width: 6px;\s*stroke-linecap: butt;/);
    expect(css).toMatch(/\.wind-rose-selected-arc \{\s*fill: none;\s*stroke: var\(--accent\);\s*stroke-width: 4px;\s*stroke-linecap: butt;/);
    expect(css).toMatch(/\.wind-rose-tip \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.wind-rose-picker-svg:focus-visible \{\s*outline: 2px solid var\(--ink\);\s*outline-offset: 2px;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.wind-rose-petal \{\s*transition: none;/);
  });
});
