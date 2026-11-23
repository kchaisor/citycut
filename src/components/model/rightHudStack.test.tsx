// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { Sidebar } from "../Sidebar";
import { SunHoursLegendDock } from "./SunHoursLegendDock";
import { sunHoursLegendCardOn } from "./sunHoursLegendCard";
import { sunHoursQualityParams, sunHoursResolution } from "../../lib/sunHoursQuality";
import type { useSunHoursGround } from "../useSunHoursGround";
import { WindStreaksSlider } from "../WindStreaksSlider";
import { siteIntelAutoFolded, windRoseCardMeta, windStreaksSliderOn } from "./windRoseCard";
import { analysesOf } from "../../lib/sidebarSections";
import { PrevailingStreamsLegend } from "../PrevailingStreamsLegend";
import { prevailingStreams } from "../../lib/windPrevailingStreams";
import { RIGHT_HUD_GAP_PX, RIGHT_HUD_TOP_PX, rightHudMaxHeight } from "../../lib/rightHudLayout";
import { getWindStreakDensity, resetWindStreakDensityCache } from "../../lib/windStreakDensity";
import { groundWindStreakCount } from "../../lib/groundWindStreaks";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetWindStreakDensityCache();
});

const css = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const block = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("}", start));
};

const windCard = <div className="wind-rose-analysis-card analysis-hud-card hud-card" aria-label="Wind rose panel" />;

function sunHoursState(sideM: number, pending = false): ReturnType<typeof useSunHoursGround> {
  const resolution = sunHoursResolution(sunHoursQualityParams("high", sideM));
  return {
    grid: { maxSunHours: 12.1 },
    overlay: null,
    scaleMaxHours: 12.1,
    resolution,
    targetResolution: resolution,
    pending,
    pendingSurfaces: false,
    study: { month: 9, day: 22, window: "day" },
  } as unknown as ReturnType<typeof useSunHoursGround>;
}

type Fold = { folded: boolean; onToggle: () => void };

function renderSidebar(siteIntelOpen: boolean, rightBelow: ReactNode = windCard, fold?: Fold) {
  return render(
    <Sidebar
      id="panel"
      items={[{ id: "display", label: "Display", icon: <span>d</span> }]}
      rightItems={[{ id: "overview", label: "Overview", icon: <span>o</span> }]}
      active="display"
      rightActive="overview"
      collapsed={false}
      title="Display"
      rightTitle="Overview"
      onSelect={() => undefined}
      onToggleCollapse={() => undefined}
      onHome={() => undefined}
      siteIntel={{
        open: siteIntelOpen,
        onToggle: () => undefined,
        icon: <span>s</span>,
        fold: fold ? { ...fold, chevron: <span className="insp-head-chevron" /> } : undefined,
      }}
      rightChildren={<p>overview</p>}
      rightBelow={rightBelow}
    >
      <p>body</p>
    </Sidebar>,
  );
}

describe("right HUD stack", () => {
  it("stacks Site Intelligence above the wind rose card in one column", () => {
    const { container } = renderSidebar(true);
    const stack = container.querySelector(".right-hud-stack");
    expect(stack).toBeTruthy();
    expect([...stack!.children].map((el) => el.className)).toEqual([
      "right-inspector hud-card",
      "wind-rose-analysis-card analysis-hud-card hud-card",
    ]);
    expect(stack!.querySelector(".right-inspector .sidebar-panel.is-right")).toBeTruthy();
  });

  it("keeps the wind rose card on the right when Site Intelligence is closed", () => {
    const { container } = renderSidebar(false);
    const stack = container.querySelector(".right-hud-stack");
    expect(stack?.querySelector(".right-inspector")).toBeNull();
    expect(stack?.querySelector(".wind-rose-analysis-card")).toBeTruthy();
  });

  it("pins the column at top 68 / right 14, 328px wide, with a 12px gap", () => {
    const floating = css("src/floating.css");
    const stack = block(floating, ".model .right-hud-stack");
    expect(stack).toMatch(/position: fixed;/);
    expect(stack).toMatch(/top: 68px;/);
    expect(stack).toMatch(/right: 14px;/);
    expect(stack).toMatch(/width: 328px;/);
    expect(stack).toMatch(/gap: var\(--space-3\);/);
    expect(stack).toMatch(/max-height: var\(--right-hud-max-height/);
    const inspector = block(floating, ".model .right-inspector");
    expect(inspector).toMatch(/width: 100%;/);
    expect(inspector).toMatch(/border-radius: var\(--radius-lg\);/);
    expect(inspector).not.toMatch(/position: fixed|268px|calc\(100vh - 134px\)/);
  });

  it("makes the wind rose card a full-width stack card with no left placement", () => {
    const index = css("src/index.css");
    const card = block(index, ".analysis-hud-card");
    expect(card).toMatch(/width: 100%;/);
    expect(card).toMatch(/border-radius: var\(--radius-lg\);/);
    expect(card).toMatch(/background: var\(--bg-card\);/);
    expect(card).toMatch(/border: 1px solid var\(--border-outer\);/);
    expect(card).toMatch(/box-shadow: var\(--shadow-hud\);/);
    expect(card).not.toMatch(/left:|bottom:/);
    expect(index).not.toMatch(/wind-rose-analysis-card\.is-plan \{/);
    expect(index).not.toMatch(/272px/);
    expect(index).not.toMatch(/--wind-plan-card-/);
    expect(index).not.toMatch(/^\.wind-rose-analysis-card \{/m);
    expect(block(index, ".wind-streaks")).toMatch(/flex: none;/);
    expect(block(index, ".analysis-hud-card.is-collapsed")).toMatch(/flex: none;/);
    expect(block(index, ".analysis-hud-card.is-collapsed")).toMatch(/min-height: var\(--hud-card-head\);/);
  });

  it("stacks the stand-alone Direct Sun Hours legend in the same column when Solar Study is off", () => {
    const { container } = renderSidebar(
      true,
      <>
        {windCard}
        <SunHoursLegendDock sunHoursGround={sunHoursState(1000, true)} />
      </>,
    );
    const stack = container.querySelector(".right-hud-stack")!;
    expect([...stack.children].map((el) => el.className)).toEqual([
      "right-inspector hud-card",
      "wind-rose-analysis-card analysis-hud-card hud-card",
      "sun-hours-hud-card hud-card",
    ]);
    const card = stack.querySelector(".sun-hours-hud-card")!;
    expect(card.getAttribute("aria-label")).toBe("Direct Sun Hours panel");
    expect(card.querySelector(".sun-hours-direct-legend-title")?.textContent).toBe(
      "Direct Sun Hours · 22 Sep · full daylight",
    );
    expect(card.querySelector(".sun-hours-direct-legend-scale")).toBeTruthy();
    expect(card.textContent).toContain("2 m grid · 5 min steps");
    expect(card.textContent).toContain("Eased from 0.25 m grid for this cut size");
    expect(card.querySelector("[data-sun-hours-calculating]")).toBeTruthy();
    expect(card.querySelector("button")).toBeNull();
    expect(container.querySelectorAll("[data-sun-hours-ground-legend-dock]")).toHaveLength(1);
  });

  it("keeps the Direct Sun Hours legend on the right when it is the only card", () => {
    const { container } = renderSidebar(false, <SunHoursLegendDock sunHoursGround={sunHoursState(120)} />);
    const stack = container.querySelector(".right-hud-stack")!;
    expect([...stack.children].map((el) => el.className)).toEqual(["sun-hours-hud-card hud-card"]);
    expect(stack.textContent).toContain("0.25 m grid · 5 min steps");
    expect(stack.querySelector("[data-sun-hours-calculating]")).toBeNull();
  });

  it("shows the Direct Sun Hours legend in 3D and the Drawing site plan only, once there is something to show", () => {
    const on = { tab: "3d", drawing: "site", sunHours: true, hasResult: true, pending: false };
    expect(sunHoursLegendCardOn(on)).toBe(true);
    expect(sunHoursLegendCardOn({ ...on, tab: "drawing" })).toBe(true);
    expect(sunHoursLegendCardOn({ ...on, hasResult: false, pending: true })).toBe(true);
    expect(sunHoursLegendCardOn({ ...on, tab: "drawing", drawing: "figure-ground" })).toBe(false);
    expect(sunHoursLegendCardOn({ ...on, tab: "satellite" })).toBe(false);
    expect(sunHoursLegendCardOn({ ...on, sunHours: false })).toBe(false);
    expect(sunHoursLegendCardOn({ ...on, hasResult: false })).toBe(false);
  });

  it("makes the Direct Sun Hours legend a full-width stack card with no bottom-left dock", () => {
    const floating = css("src/floating.css");
    const card = block(floating, ".sun-hours-hud-card");
    expect(card).toMatch(/width: 100%;/);
    expect(card).toMatch(/padding: var\(--space-4\);/);
    expect(card).toMatch(/border-radius: var\(--radius-lg\);/);
    expect(card).toMatch(/background: var\(--bg-card\);/);
    expect(card).toMatch(/border: 1px solid var\(--border-outer\);/);
    expect(card).toMatch(/box-shadow: var\(--shadow-hud\);/);
    expect(card).not.toMatch(/position: (absolute|fixed)|left:|bottom:/);
    expect(block(floating, ".sun-hours-hud-card .sun-hours-direct-legend.is-compact")).toMatch(/width: 100%;/);
    expect(floating).not.toMatch(/sun-hours-direct-dock-stack|plan-solar-dock-stack|plan-solar-legend-dock/);
    const tabs = css("src/components/model/ModelPageViewportTabs.tsx");
    expect(tabs).not.toContain("SunHoursLegendDock");
    const sidebar = css("src/components/model/ModelPageSidebar.tsx");
    expect(sidebar).toContain("{sunHoursLegendAlone ? <SunHoursLegendDock sunHoursGround={vm.sunHoursGround} /> : null}");
    expect(sidebar).toContain("{analysisCards.solar ? <SolarStudyHudCard vm={vm} /> : null}");
    expect(sidebar).toContain("{analysisCards.wind ? <WindRoseHudCard vm={vm} /> : null}");
    expect(sidebar).toContain("{analysisCards.view ? <ViewshedHudCard vm={vm} /> : null}");
    expect(sidebar.indexOf("<SolarStudyHudCard")).toBeLessThan(sidebar.indexOf("<WindRoseHudCard"));
    expect(sidebar.indexOf("<WindRoseHudCard")).toBeLessThan(sidebar.indexOf("<ViewshedHudCard"));
  });

  it("centres the Analysis console in the lane left clear by the rail and the right stack", () => {
    const consoleCss = block(css("src/floating.css"), ".model .bottom-bar.env-console");
    expect(consoleCss).toMatch(/--env-console-lane-left/);
    expect(consoleCss).toMatch(/--env-console-lane-right/);
    expect(consoleCss).toMatch(/max-width: var\(--env-console-lane\) !important;/);
  });
});

describe("Wind streaks slider", () => {
  it("shows only in 3D with Wind Rose on and 3D Wind Flow running, with or without Solar Study", () => {
    const on = { tab: "3d", analyses: analysesOf("wind"), windEnabled: true, planActive: false };
    expect(windStreaksSliderOn(on)).toBe(true);
    expect(windStreaksSliderOn({ ...on, analyses: analysesOf("wind", "solar") })).toBe(true);
    expect(windStreaksSliderOn({ ...on, tab: "drawing" })).toBe(false);
    expect(windStreaksSliderOn({ ...on, windEnabled: false })).toBe(false);
    expect(windStreaksSliderOn({ ...on, analyses: analysesOf("solar") })).toBe(false);
    expect(windStreaksSliderOn({ ...on, planActive: true })).toBe(false);
  });

  it("is named Density, defaults to 1.0x and drives the streak count", () => {
    render(<WindStreaksSlider />);
    const slider = screen.getByRole("slider", { name: "Density" });
    expect(screen.queryByRole("slider", { name: "Wind streaks" })).toBeNull();
    expect(document.querySelector(".wind-streaks-title")?.textContent?.trim()).toBe("Density");
    expect((slider as HTMLInputElement).value).toBe("1");
    expect(slider.getAttribute("min")).toBe("0.5");
    expect(slider.getAttribute("max")).toBe("2.5");
    expect(screen.queryByText("Default")).toBeNull();
    expect(document.querySelector("output.wind-streaks-value")?.textContent).toBe("1.0×");
    expect(screen.getByText("Fewer")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
    expect(groundWindStreakCount({ sideM: 1000 }, getWindStreakDensity())).toBe(2500);

    fireEvent.change(slider, { target: { value: "2" } });
    expect(getWindStreakDensity()).toBe(2);
    expect(groundWindStreakCount({ sideM: 1000 }, getWindStreakDensity())).toBe(5000);
    expect(document.querySelector("output.wind-streaks-value")?.textContent).toBe("2.0×");
    expect(window.localStorage.getItem("citycut.wind.streakDensity")).toBe("2");
  });
});

describe("Wind streaks slider chrome", () => {
  it("styles a 4px track with an ink fill, a 16px thumb, a 32px hit area and a default tick", () => {
    const index = css("src/index.css");
    expect(block(index, ".wind-streaks-input::-webkit-slider-runnable-track")).toMatch(/height: var\(--space-1\);/);
    expect(block(index, ".wind-streaks-input::-webkit-slider-runnable-track")).toMatch(/var\(--ink\) var\(--wind-streaks-fill\), var\(--slider-track\)/);
    const thumb = block(index, ".wind-streaks-input::-webkit-slider-thumb");
    expect(thumb).toMatch(/width: var\(--space-4\);/);
    expect(thumb).toMatch(/background: var\(--bg-elev\);/);
    expect(thumb).toMatch(/box-shadow: var\(--shadow-raised\);/);
    expect(block(index, ".wind-streaks-input")).toMatch(/height: var\(--control-md\);/);
    expect(block(index, ".wind-streaks-row")).toMatch(/align-items: center;/);
    expect(css("src/theme.css")).toMatch(/--slider-track: rgb\(20 20 19 \/ 15%\);/);
    const { container } = render(<WindStreaksSlider />);
    expect(container.querySelector<HTMLElement>(".wind-streaks-track")!.style.getPropertyValue("--wind-streaks-tick")).toBe("0.25");
  });

  it("shows the reduced-motion info icon only when motion is reduced, with Animate anyway reachable", () => {
    const { container, rerender } = render(<WindStreaksSlider />);
    expect(container.querySelector(".wind-streaks-info-btn")).toBeNull();
    let animate = false;
    rerender(<WindStreaksSlider reducedMotion={{ animateAnyway: false, onAnimateAnyway: (v) => (animate = v) }} />);
    const info = screen.getByRole("button", { name: /reduced-motion/ });
    expect(info.closest(".wind-streaks-row")).toBeTruthy();
    fireEvent.focus(info);
    fireEvent.click(screen.getByRole("checkbox", { name: "Animate anyway" }));
    expect(animate).toBe(true);
  });
});

describe("wind rose card header", () => {
  it("reads period and station years in the meta, and is a 48px row", () => {
    expect(windRoseCardMeta("Annual", 15)).toBe("Annual · 15 yrs");
    expect(windRoseCardMeta("Annual", 15, "All day")).toBe("Annual · 15 yrs");
    expect(windRoseCardMeta("Annual", 15, "Morning")).toBe("Annual · Morning · 15 yrs");
    expect(windRoseCardMeta("Jan", undefined)).toBe("Jan");
    const head = block(css("src/index.css"), ".analysis-card-head");
    expect(head).toMatch(/height: var\(--hud-card-head\);/);
    expect(css("src/theme.css")).toMatch(/--hud-card-head: 48px;/);
  });
});

describe("Site Intelligence chrome", () => {
  const floating = () => css("src/floating.css");

  it("pads the card 16px with a 12px gap and a 12px bottom scroll fade", () => {
    const inspector = block(floating(), ".model .right-inspector");
    expect(inspector).toMatch(/padding: var\(--space-4\);/);
    expect(inspector).toMatch(/gap: var\(--space-3\);/);
    const fade = block(floating(), ".model .right-inspector::after");
    expect(fade).toMatch(/position: sticky;/);
    expect(fade).toMatch(/height: var\(--space-3\);/);
    expect(fade).toMatch(/linear-gradient\(to bottom, transparent, var\(--bg-card\)\)/);
  });

  it("flattens every KPI cell rule: no fill, no tile radius", () => {
    const rules = floating().match(/\.model \.right-inspector \.kpi-cell \{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const rule of rules) {
      expect(rule).not.toMatch(/--hud-kpi-bg|--bg-sub|#F7F6F2/i);
      expect(rule).not.toMatch(/border-radius: (7px|var\(--radius)/);
    }
    for (const rule of floating().match(/\.model \.right-inspector \.kpi-num \{[^}]*\}/g) ?? []) {
      expect(rule).toMatch(/font-size: var\(--fs-title\)/);
      expect(rule).toMatch(/font-weight: 600/);
    }
    expect(css("src/theme.css")).toMatch(/--fs-title: 16px;/);
  });

  it("draws the use-mix bar 6px high", () => {
    expect(block(floating(), ".model .right-inspector .dist-bar")).toMatch(/height: var\(--space-1-5\);/);
  });

  it("styles Colour by as the 32px Mode control: accent with an ink edge", () => {
    expect(block(floating(), ".model .right-inspector .segmented")).toMatch(/height: var\(--control-md\);/);
    const active = block(floating(), '.model .right-inspector .segmented button[aria-pressed="true"]');
    expect(active).toMatch(/background: var\(--accent\);/);
    expect(active).toMatch(/box-shadow: inset 0 0 0 1px var\(--ink\);/);
  });

  it("leaves the terrain error to the toast, not the inspector", () => {
    expect(css("src/components/model/ModelPageSidebarRight.tsx")).not.toContain("model.terrainError");
  });
});

describe("Site Intelligence beside the Wind Rose card", () => {
  it("folds to its 48px header when any analysis card opens and unfolds when the last one closes", () => {
    expect(siteIntelAutoFolded(true)).toBe(true);
    expect(siteIntelAutoFolded(false)).toBe(false);
    const hook = css("src/components/model/useModelPage.tsx");
    expect(hook).toContain("useEffect(() => setSiteIntelFolded(siteIntelAutoFolded(analysisCardOn)), [analysisCardOn]);");
    const folded = block(css("src/floating.css"), ".model .right-inspector.is-folded");
    expect(hook).toContain("const analysisCardOn = anyAnalysisCardOn(tab, analyses);");
    expect(folded).toMatch(/height: var\(--hud-card-head\);/);
    expect(folded).toMatch(/flex: none;/);
    expect(css("src/theme.css")).toMatch(/--hud-card-head: 48px;/);
  });

  it("shows only the header row while folded, and the row is the toggle", () => {
    let toggles = 0;
    const { container } = renderSidebar(true, windCard, { folded: true, onToggle: () => (toggles += 1) });
    const stack = container.querySelector(".right-hud-stack")!;
    expect([...stack.children].map((el) => el.className)).toEqual([
      "right-inspector hud-card is-folded",
      "wind-rose-analysis-card analysis-hud-card hud-card",
    ]);
    const inspector = stack.querySelector(".right-inspector")!;
    expect(inspector.children).toHaveLength(1);
    const head = screen.getByRole("button", { name: /Site Intelligence/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(inspector.querySelector(".sidebar-panel.is-right")).toBeNull();
    fireEvent.click(head);
    expect(toggles).toBe(1);
  });

  it("opens again by hand with the Wind Rose card still under it", () => {
    const { container } = renderSidebar(true, windCard, { folded: false, onToggle: () => undefined });
    expect(screen.getByRole("button", { name: /Site Intelligence/ }).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".right-inspector")!.className).toBe("right-inspector hud-card");
    expect(container.querySelector(".right-inspector .sidebar-panel.is-right")).toBeTruthy();
  });

  it("stacks folded Site Intelligence, the Wind Rose card and Direct Sun Hours in one column", () => {
    const { container } = renderSidebar(
      true,
      <>
        {windCard}
        <SunHoursLegendDock sunHoursGround={sunHoursState(500)} />
      </>,
      { folded: true, onToggle: () => undefined },
    );
    expect([...container.querySelector(".right-hud-stack")!.children].map((el) => el.className)).toEqual([
      "right-inspector hud-card is-folded",
      "wind-rose-analysis-card analysis-hud-card hud-card",
      "sun-hours-hud-card hud-card",
    ]);
  });
});

describe("Wind Rose card size", () => {
  const HEAD = 48;
  const ROSE = 176;

  it("caps the stack at the viewport minus 80", () => {
    for (const vh of [800, 900]) {
      const stack = { left: 938, right: 1266, top: RIGHT_HUD_TOP_PX, bottom: vh };
      expect(rightHudMaxHeight(vh, stack, [])).toBe(vh - 80);
    }
    expect(block(css("src/floating.css"), ".model .right-hud-stack")).toMatch(
      /max-height: var\(--right-hud-max-height, calc\(100vh - 68px - var\(--space-3\)\)\);/,
    );
    expect(css("src/theme.css")).toMatch(/--space-3: 12px;/);
  });

  it("fills the Wind Rose card width and scrolls the card body instead of shrinking the rose", () => {
    const index = css("src/index.css");
    expect(css("src/theme.css")).toMatch(/--wind-rose-size: 176px;/);
    const chart = block(index, ".wind-rose-chart");
    expect(chart).toMatch(/min-width: var\(--wind-rose-size\);/);
    expect(chart).toMatch(/flex: none;/);
    const cardChart = block(index, ".wind-rose-analysis-card .wind-rose-chart");
    expect(cardChart).toMatch(/width: 100%;/);
    expect(block(index, ".analysis-card-body")).toMatch(/overflow-y: auto;/);
    expect(block(index, ".analysis-card-body")).toMatch(/min-height: 0;/);
  });

  it("leaves room for the whole rose at 1440x900 and 1280x800 with Site Intelligence folded", () => {
    for (const vh of [900, 800]) {
      const body = vh - 80 - HEAD - RIGHT_HUD_GAP_PX - HEAD;
      expect(body, String(vh)).toBeGreaterThanOrEqual(ROSE);
      expect(body - ROSE, String(vh)).toBeGreaterThan(300);
    }
  });
});

describe("Prevailing streams legend", () => {
  const stats = {
    period: "annual" as const,
    totalHours: 1,
    calmHours: 0,
    calmPercent: 0,
    sectorFrequency: [0.5, 0.3, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0, 0, 0],
    prevailingSector: 0,
    prevailingLabel: "N",
    prevailingMedianKmh: 12,
    sectorSpeedBins: Array.from({ length: 16 }, (_, sector) =>
      sector === 0 ? [0, 0.2, 0.3, 0, 0] : sector === 1 ? [0, 0.3, 0, 0, 0] : sector === 8 ? [0.1, 0.1, 0, 0, 0] : [0, 0, 0, 0, 0],
    ),
    speedBinEdgesMs: [0.4, 2, 4, 6, 8, 100],
  };

  it("lists each stream as From N · 3.6 m/s with a flat arrow swatch in its fill and no ink edge", () => {
    const { container } = render(<PrevailingStreamsLegend streams={prevailingStreams(stats)} periodLabel="Annual" />);
    const rows = [...container.querySelectorAll(".wind-streams-legend-row")];
    expect(rows.map((row) => row.textContent)).toEqual(["From N · 4.2 m/s", "From NNE · 3.0 m/s", "From S · 2.1 m/s"]);
    expect(screen.getByText("Prevailing streams")).toBeTruthy();
    expect(screen.getByText("Annual")).toBeTruthy();
    const paths = [...container.querySelectorAll(".wind-streams-legend-swatch path")];
    expect(paths.map((p) => p.getAttribute("fill"))).toEqual([
      "var(--wind-stream-1)",
      "var(--wind-stream-2)",
      "var(--wind-stream-3)",
    ]);
    for (const p of paths) expect(p.hasAttribute("stroke")).toBe(false);
    expect(css("src/index.css")).not.toMatch(/wind-streams-legend-swatch[^}]*stroke/);
  });

  it("renders nothing when there are no streams", () => {
    const { container } = render(<PrevailingStreamsLegend streams={[]} periodLabel="Annual" />);
    expect(container.firstChild).toBeNull();
  });
});
