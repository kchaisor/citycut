// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  envConsoleBox,
  envConsoleLanes,
  envConsoleMaxWidth,
  RIGHT_HUD_RIGHT_PX,
  RIGHT_HUD_TOP_PX,
  RIGHT_HUD_WIDTH_PX,
  rightHudMaxHeight,
  type HudBox,
} from "../../lib/rightHudLayout";
import { ENV_CONSOLE_ONE_ROW_CONTENT_PX, envConsoleBarWidth, envConsoleRowFits } from "../../lib/solarBarLayout";
import type { WindViewSettings } from "../../lib/windState";
import type { SolarViewSettings } from "../SolarHeliodon";
import { AnalysisHudHarness as Hud } from "./analysisHudHarness";

const floating = readFileSync(resolve(__dirname, "../../floating.css"), "utf8");
const rule = (selector: string) => {
  const start = floating.indexOf(`${selector} {`);
  return start < 0 ? "" : floating.slice(start, floating.indexOf("}", start));
};
const BAR = ".model .bottom-bar.env-console";
const bar = () => screen.getByRole("region", { name: "Environmental analysis console" });

function modeButton(name: string) {
  return within(screen.getByRole("group", { name: "Analysis modes" })).getByRole("button", { name });
}

const MOVED_TO_CARDS = [
  "Shadows",
  "Sun hours",
  "Sun dome",
  "3D Sun Dome",
  "9–3pm Plan Fan",
  "Annual",
  "Flow",
  "Streaks",
  "3D Wind Flow",
  "Wind streaks",
  "Pause wind animation",
  "Draw path",
  "Compute",
  "Play walk",
  "Clear",
];

function expectBarIsModesAndQualityOnly() {
  const el = bar();
  expect(Array.from(el.children).map((row) => row.className)).toEqual(["env-top-row"]);
  expect(within(el).getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Solar Study",
    "Wind Rose",
    "Viewshed Walk",
    "High",
    "Fast",
  ]);
  expect(within(el).getByText("Analysis")).toBeTruthy();
  expect(within(el).queryByRole("slider")).toBeNull();
  expect(within(el).queryByLabelText("Live solar telemetry")).toBeNull();
  expect(within(el).queryByLabelText("Live wind telemetry")).toBeNull();
  expect(el.textContent).not.toMatch(/ALT|AZ|DAYLIGHT|PREVAILING|21 Jun|AEST/);
  for (const name of MOVED_TO_CARDS) expect(within(el).queryByRole("button", { name }), name).toBeNull();
  for (const group of ["Solar date presets", "Solar overlays", "Wind season presets", "Design winds", "Viewshed overlay toggles"]) {
    expect(within(el).queryByRole("group", { name: group }), group).toBeNull();
  }
}

describe("Analysis bar", () => {
  afterEach(cleanup);

  it("is one row of the three analysis toggles and High / Fast on a new cut, with no muted solar chrome", () => {
    render(<Hud />);
    expect(bar().getAttribute("data-analysis")).toBe("none");
    for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) {
      expect(modeButton(name).getAttribute("aria-pressed")).toBe("false");
    }
    expectBarIsModesAndQualityOnly();
    expect(bar().querySelector("[inert]")).toBeNull();
    expect(bar().querySelector(".env-solar-idle, .env-solar-chrome, .env-bottom-row")).toBeNull();
  });

  it("no longer carries the Arrows tool, which lives in the left rail", () => {
    for (const props of [{}, { tab: "drawing" as const }]) {
      render(<Hud {...props} />);
      expect(within(bar()).queryByRole("button", { name: "Arrows" })).toBeNull();
      expect(within(bar()).queryByText("Diagram")).toBeNull();
      expect(bar().querySelector("[data-diagram]")).toBeNull();
      cleanup();
    }
  });

  it("stays that one row with any mix of analyses on, in 3D, Plan and Drawing", () => {
    for (const props of [{}, { projection: "plan" as const }, { tab: "drawing" as const }]) {
      render(<Hud {...props} />);
      for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) {
        fireEvent.click(modeButton(name));
        expectBarIsModesAndQualityOnly();
      }
      expect(bar().getAttribute("data-analysis")).toBe("solar wind view");
      fireEvent.click(modeButton("Solar Study"));
      expectBarIsModesAndQualityOnly();
      cleanup();
    }
  });

  it("fits on one row at 1440 and 1280 beside the outliner, under the 328px right column", () => {
    expect(envConsoleRowFits(envConsoleBarWidth(), ENV_CONSOLE_ONE_ROW_CONTENT_PX)).toBe(true);
    for (const [vw, vh] of [
      [1440, 900],
      [1280, 800],
    ] as const) {
      const outliner: HudBox = { left: 74, right: 322, top: 68, bottom: vh - 66 };
      const measured: HudBox = { left: 0, right: envConsoleBarWidth(), top: vh - 68, bottom: vh - 14 };
      const column: HudBox = {
        left: vw - RIGHT_HUD_RIGHT_PX - RIGHT_HUD_WIDTH_PX,
        right: vw - RIGHT_HUD_RIGHT_PX,
        top: RIGHT_HUD_TOP_PX,
        bottom: vh,
      };
      const stack = { ...column, bottom: column.top + rightHudMaxHeight(vh, column, [measured], measured) };
      expect(stack.bottom, String(vw)).toBe(measured.top - 16);
      const lanes = envConsoleLanes(vw, measured, [outliner], stack);
      expect(envConsoleMaxWidth(vw, lanes), String(vw)).toBeGreaterThanOrEqual(envConsoleBarWidth());
      const placed = envConsoleBox(vw, lanes, envConsoleBarWidth(), measured.top, measured.bottom);
      expect(placed.right - placed.left, String(vw)).toBe(envConsoleBarWidth());
      expect(placed.left - outliner.right, String(vw)).toBeGreaterThanOrEqual(16);
      expect(placed.right, String(vw)).toBeLessThanOrEqual(vw - 16);
    }
  });

  it("is styled as a single nowrap row sized to its content, with no leftover slider-row rules", () => {
    expect(rule(`${BAR} .env-top-row`)).toMatch(/flex-wrap: nowrap !important;/);
    expect(rule(`${BAR} .env-top-row`)).toMatch(/white-space: nowrap !important;/);
    expect(rule(BAR)).toMatch(/width: max-content !important;/);
    expect(rule(BAR)).toMatch(/max-width: var\(--env-console-lane\) !important;/);
    expect(rule(BAR)).not.toMatch(/min-width|min-height/);
    expect(rule(`${BAR} .env-quality`)).toMatch(/flex-shrink: 0 !important;/);
    expect(floating).not.toMatch(/env-console \.(env-bottom-row|env-solar|daylight-scrubber|time-readout-pill|p-pill|ov-chip|date-presets)/);
    expect(floating).not.toContain("is-combined");
  });

  it("shows a High/Fast quality switch that changes the render quality", () => {
    render(<Hud />);
    const group = screen.getByRole("group", { name: "Render quality" });
    const high = within(group).getByRole("button", { name: "High render quality" });
    const fast = within(group).getByRole("button", { name: "Fast render quality" });
    expect(bar().querySelector(".env-top-row")?.lastElementChild).toBe(group);
    expect(high.getAttribute("aria-pressed")).toBe("true");
    expect(fast.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(fast);
    expect(high.getAttribute("aria-pressed")).toBe("false");
    expect(fast.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(high);
    expect(high.getAttribute("aria-pressed")).toBe("true");
    for (const kind of ["Solar Study", "Wind Rose", "Viewshed Walk"]) {
      fireEvent.click(modeButton(kind));
      expect(document.querySelector(".analysis-hud-card [aria-label='Render quality']")).toBeNull();
    }
  });

  it("has no Walk Ripple mode and no sun dome key", () => {
    render(<Hud initialKinds={["solar"]} />);
    expect(within(screen.getByRole("group", { name: "Analysis modes" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Solar Study",
      "Wind Rose",
      "Viewshed Walk",
    ]);
    expect(screen.queryByText(/Walk Ripple/)).toBeNull();
    expect(screen.queryByRole("list", { name: "Sun dome key" })).toBeNull();
    expect(document.querySelector(".sun-dome-key")).toBeNull();
  });

  it("toggles each analysis on its own: clicking one never turns another off", () => {
    render(<Hud />);
    fireEvent.click(modeButton("Solar Study"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(modeButton("Solar Study"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(modeButton("Wind Rose"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("true");
    expect(modeButton("Wind Rose").getAttribute("aria-pressed")).toBe("true");
    expect(bar().getAttribute("data-analysis")).toBe("solar wind");
    fireEvent.click(modeButton("Viewshed Walk"));
    expect(bar().getAttribute("data-analysis")).toBe("solar wind view");
    for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) fireEvent.click(modeButton(name));
    expect(bar().getAttribute("data-analysis")).toBe("none");
  });

  it("turns wind on with Wind Rose, off when Wind Rose is turned off, and leaves it on when Solar Study is clicked", () => {
    const winds: WindViewSettings[] = [];
    render(<Hud onWind={(next) => winds.push(next)} />);
    fireEvent.click(modeButton("Wind Rose"));
    expect(winds.at(-1)?.enabled).toBe(true);
    fireEvent.click(modeButton("Wind Rose"));
    expect(winds.at(-1)?.enabled).toBe(false);
    fireEvent.click(modeButton("Wind Rose"));
    const before = winds.length;
    fireEvent.click(modeButton("Solar Study"));
    expect(winds.length).toBe(before);
    expect(winds.at(-1)?.enabled).toBe(true);
    fireEvent.click(modeButton("Solar Study"));
    expect(winds.at(-1)?.enabled).toBe(true);
    expect(modeButton("Wind Rose").getAttribute("aria-pressed")).toBe("true");
  });

  it("turns Shadows and the sun dome on when Solar Study is clicked, alone or beside another analysis, leaving Sun hours off", () => {
    for (const from of [null, "Wind Rose", "Viewshed Walk"]) {
      const calls: SolarViewSettings[] = [];
      render(<Hud onSolar={(next) => calls.push(next)} />);
      if (from) fireEvent.click(modeButton(from));
      expect(calls).toEqual([]);
      fireEvent.click(modeButton("Solar Study"));
      expect(calls.at(-1)).toMatchObject({ castShadows: true, showPath: true, sunHours: false });
      cleanup();
    }
  });

  it("marks the active mode with the accent class and styles it as an accent mode chip", () => {
    render(<Hud initialKinds={["solar"]} />);
    expect(modeButton("Solar Study").className).toBe("env-mode-btn active");
    expect(modeButton("Wind Rose").className).toBe("env-mode-btn");
    const active = rule(`${BAR} .env-mode-btn.active`);
    expect(active).toContain("background: var(--accent)");
    expect(active).toContain("inset 0 0 0 1px var(--ink)");
    expect(active).toContain("font-weight: 700");
    expect(rule(`${BAR} .env-console-title`)).toContain("font-size: var(--fs-micro)");
  });

  it("stays hidden on Satellite, with no analysis cards", () => {
    render(<Hud initialKinds={["solar", "wind", "view"]} tab="satellite" />);
    expect(screen.queryByRole("region", { name: "Environmental analysis console" })).toBeNull();
    expect(document.querySelector(".analysis-hud-card")).toBeNull();
  });
});

describe("Sun hours layers follow the toggle", () => {
  it("only feeds the 3D heatmap when Sun hours is on, and keeps the legend out of the viewport", () => {
    const tabs = readFileSync(resolve(__dirname, "ModelPageViewportTabs.tsx"), "utf8");
    expect(tabs).toContain("sunHoursGroundGrid={viewSolar.sunHours ? sunHoursGround.grid : null}");
    expect(tabs).toContain("sunHoursDirectOverlay={viewSolar.sunHours ? sunHoursGround.overlay : null}");
    expect(tabs).not.toContain("SunHoursLegendDock");
    expect(tabs).not.toContain("ViewLegend");
    const card = readFileSync(resolve(__dirname, "SolarStudyHudCard.tsx"), "utf8");
    expect(card).toContain("sunHours: Boolean(solar.sunHours)");
    expect(card).toContain("<SunHoursLegendDock sunHoursGround={sunHoursGround} embedded pickedOnly={sunHoursPickedOnly} />");
    expect(tabs).toContain("solarAnalysisActive={solarStudyViewActive(analyses)}");
    expect(tabs).not.toContain("analysisKind");
  });
});
