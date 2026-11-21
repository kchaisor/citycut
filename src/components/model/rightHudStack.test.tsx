// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar } from "../Sidebar";
import { WindStreaksSlider } from "../WindStreaksSlider";
import { windRoseCardAutoCollapsed, windRoseCardMeta, windStreaksSliderOn } from "./windRoseCard";
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

function renderSidebar(siteIntelOpen: boolean) {
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
      siteIntel={{ open: siteIntelOpen, onToggle: () => undefined, icon: <span>s</span> }}
      rightChildren={<p>overview</p>}
      rightBelow={<div className="wind-rose-analysis-card hud-card" aria-label="Wind rose panel" />}
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
      "wind-rose-analysis-card hud-card",
    ]);
    expect(stack!.querySelector(".right-inspector .sidebar-panel.is-right")).toBeTruthy();
  });

  it("keeps the wind rose card on the right when Site Intelligence is closed", () => {
    const { container } = renderSidebar(false);
    const stack = container.querySelector(".right-hud-stack");
    expect(stack?.querySelector(".right-inspector")).toBeNull();
    expect(stack?.querySelector(".wind-rose-analysis-card")).toBeTruthy();
  });

  it("pins the column at top 68 / right 14, 304px wide, with a 12px gap", () => {
    const floating = css("src/floating.css");
    const stack = block(floating, ".model .right-hud-stack");
    expect(stack).toMatch(/position: fixed;/);
    expect(stack).toMatch(/top: 68px;/);
    expect(stack).toMatch(/right: 14px;/);
    expect(stack).toMatch(/width: 304px;/);
    expect(stack).toMatch(/gap: var\(--space-3\);/);
    expect(stack).toMatch(/max-height: var\(--right-hud-max-height/);
    const inspector = block(floating, ".model .right-inspector");
    expect(inspector).toMatch(/width: 100%;/);
    expect(inspector).toMatch(/border-radius: var\(--radius-lg\);/);
    expect(inspector).not.toMatch(/position: fixed|268px|calc\(100vh - 134px\)/);
  });

  it("makes the wind rose card a full-width stack card with no left placement", () => {
    const index = css("src/index.css");
    const card = block(index, ".wind-rose-analysis-card");
    expect(card).toMatch(/width: 100%;/);
    expect(card).toMatch(/border-radius: var\(--radius-lg\);/);
    expect(card).toMatch(/background: var\(--bg-card\);/);
    expect(card).toMatch(/border: 1px solid var\(--border-outer\);/);
    expect(card).toMatch(/box-shadow: var\(--shadow-hud\);/);
    expect(card).not.toMatch(/left:|bottom:/);
    expect(index).not.toMatch(/wind-rose-analysis-card\.is-plan \{/);
    expect(index).not.toMatch(/272px/);
    expect(index).not.toMatch(/--wind-plan-card-/);
    expect(block(index, ".wind-streaks")).toMatch(/flex: none;/);
  });

  it("centres the Analysis console in the lane left clear by the rail and the right stack", () => {
    const consoleCss = block(css("src/floating.css"), ".model .bottom-bar.env-console");
    expect(consoleCss).toMatch(/--env-console-lane-left/);
    expect(consoleCss).toMatch(/--env-console-lane-right/);
    expect(consoleCss).toMatch(/max-width: var\(--env-console-lane\) !important;/);
  });
});

describe("Wind streaks slider", () => {
  it("shows only in 3D with Wind Rose streaks running", () => {
    const on = { tab: "3d", analysisKind: "wind" as const, windEnabled: true, planActive: false };
    expect(windStreaksSliderOn(on)).toBe(true);
    expect(windStreaksSliderOn({ ...on, tab: "drawing" })).toBe(false);
    expect(windStreaksSliderOn({ ...on, windEnabled: false })).toBe(false);
    expect(windStreaksSliderOn({ ...on, analysisKind: "solar" })).toBe(false);
    expect(windStreaksSliderOn({ ...on, planActive: true })).toBe(false);
  });

  it("is named Wind streaks, defaults to 1.0x and drives the streak count", () => {
    render(<WindStreaksSlider />);
    const slider = screen.getByRole("slider", { name: "Wind streaks" });
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
    expect(block(index, ".wind-streaks")).toMatch(/padding: var\(--space-4\) 0;/);
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
  it("auto-collapses for Buildings or Trees below 1440 and expands otherwise", () => {
    expect(windRoseCardAutoCollapsed("buildings", 1280)).toBe(true);
    expect(windRoseCardAutoCollapsed("trees", 1439)).toBe(true);
    expect(windRoseCardAutoCollapsed("summary", 1280)).toBe(false);
    expect(windRoseCardAutoCollapsed("buildings", 1440)).toBe(false);
    expect(windRoseCardAutoCollapsed("trees", 1920)).toBe(false);
  });

  it("reads period and station years in the meta, and is a 48px row", () => {
    expect(windRoseCardMeta("Annual", 15)).toBe("Annual · 15 yrs");
    expect(windRoseCardMeta("Jan", undefined)).toBe("Jan");
    const head = block(css("src/index.css"), ".wind-rose-card-head");
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
