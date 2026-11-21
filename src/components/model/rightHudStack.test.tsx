// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar } from "../Sidebar";
import { WindStreaksSlider } from "../WindStreaksSlider";
import { windStreaksSliderOn } from "./windRoseCard";
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
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("Fewer")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
    expect(groundWindStreakCount({ sideM: 1000 }, getWindStreakDensity())).toBe(2500);

    fireEvent.change(slider, { target: { value: "2" } });
    expect(getWindStreakDensity()).toBe(2);
    expect(groundWindStreakCount({ sideM: 1000 }, getWindStreakDensity())).toBe(5000);
    expect(screen.queryByText("Default")).toBeNull();
    expect(window.localStorage.getItem("citycut.wind.streakDensity")).toBe("2");
  });
});
