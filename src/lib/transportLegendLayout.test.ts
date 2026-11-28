import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  envConsoleBox,
  envConsoleLanes,
  HUD_GUTTER_PX,
  HUD_ISLAND_GAP_PX,
  RIGHT_HUD_RIGHT_PX,
  RIGHT_HUD_TOP_PX,
  RIGHT_HUD_WIDTH_PX,
  transportLegendBottom,
  type HudBox,
} from "./rightHudLayout";

const css = readFileSync(path.resolve(__dirname, "../floating.css"), "utf8");
const hook = readFileSync(path.resolve(__dirname, "../components/model/useRightHudLayout.ts"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function px(block: string, prop: string): number {
  const m = block.match(new RegExp(`\\b${prop}:\\s*(-?\\d+)px`));
  if (!m) throw new Error(`missing ${prop}`);
  return Number(m[1]);
}

const dock = rule(".model .transport-legend-dock");
const dockOutliner = rule(".model:has(.left-outliner:not([hidden])) .transport-legend-dock");
const LEGEND_LEFT = px(dockOutliner, "left");
const LEGEND_WIDTH = px(dock, "width");
const LEGEND_HEIGHT = 102;
const CONSOLE_BOTTOM_PX = 14;
const TOAST_BOTTOM_PX = 96;
const TOAST_HEIGHT_PX = 38;

const rail: HudBox = { left: 14, right: 66, top: 68, bottom: 260 };
const outliner: HudBox = { left: 74, right: 322, top: 68, bottom: 820 };
const stackAt = (vw: number): HudBox => ({
  left: vw - RIGHT_HUD_RIGHT_PX - RIGHT_HUD_WIDTH_PX,
  right: vw - RIGHT_HUD_RIGHT_PX,
  top: RIGHT_HUD_TOP_PX,
  bottom: RIGHT_HUD_TOP_PX + 600,
});

function overlaps(a: HudBox, b: HudBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function layout(vw: number, vh: number, consoleHeight: number, withToast: boolean) {
  const measured: HudBox = {
    left: 0,
    right: 720,
    top: vh - CONSOLE_BOTTOM_PX - consoleHeight,
    bottom: vh - CONSOLE_BOTTOM_PX,
  };
  const lanes = envConsoleLanes(vw, measured, [rail, outliner], stackAt(vw));
  const bar = envConsoleBox(vw, lanes, 900, measured.top, measured.bottom);
  const toast: HudBox | null = withToast
    ? { left: 16, right: 436, top: vh - TOAST_BOTTOM_PX - TOAST_HEIGHT_PX, bottom: vh - TOAST_BOTTOM_PX }
    : null;
  const bottom = transportLegendBottom(vh, [bar, toast]);
  const legend: HudBox = {
    left: LEGEND_LEFT,
    right: LEGEND_LEFT + LEGEND_WIDTH,
    top: vh - bottom - LEGEND_HEIGHT,
    bottom: vh - bottom,
  };
  return { bar, toast, legend, bottom, lanes };
}

describe("transport legend dock layout", () => {
  it("has no fixed bottom offset in CSS and reads the measured variable", () => {
    expect(dock).toMatch(/bottom:\s*var\(--transport-legend-bottom\b/);
    expect(dock).not.toMatch(/bottom:\s*\d+px/);
    const dockRules = css.match(/[^{}]*\.transport-legend-dock\s*\{[^}]*\}/g) ?? [];
    expect(dockRules.length).toBeGreaterThan(0);
    for (const block of dockRules) {
      expect(block).not.toMatch(/bottom:\s*(104|142)px/);
      expect(block).not.toMatch(/stage-error/);
    }
    expect(LEGEND_LEFT).toBe(330);
    expect(LEGEND_WIDTH).toBe(156);
  });

  it("is fed by the right HUD layout hook from the console and the terrain toast", () => {
    expect(hook).toMatch(/--transport-legend-bottom/);
    expect(hook).toMatch(/transportLegendBottom\(/);
    expect(hook).toMatch(/\.viewport > \.stage-error/);
  });

  it.each([
    { name: "1440x900, 82px bar", vw: 1440, vh: 900, h: 82, toast: false, bottom: 104 },
    { name: "1280x800, 82px bar", vw: 1280, vh: 800, h: 82, toast: false, bottom: 104 },
    { name: "1280x800, 154px wrapped bar (Wind Rose on)", vw: 1280, vh: 800, h: 154, toast: false, bottom: 176 },
    { name: "1280x800, 154px wrapped bar plus terrain toast", vw: 1280, vh: 800, h: 154, toast: true, bottom: 176 },
    { name: "1440x900, 82px bar plus terrain toast above it", vw: 1440, vh: 900, h: 82, toast: true, bottom: 142 },
  ])("clears the Analysis bar at $name", ({ vw, vh, h, toast, bottom }) => {
    const r = layout(vw, vh, h, toast);
    expect(r.lanes.left).toBe(outliner.right + HUD_GUTTER_PX);
    expect(r.bottom).toBe(bottom);
    expect(overlaps(r.legend, r.bar)).toBe(false);
    expect(r.bar.top - r.legend.bottom).toBeGreaterThanOrEqual(HUD_ISLAND_GAP_PX);
    if (r.toast) {
      expect(overlaps(r.legend, r.toast)).toBe(false);
      expect(r.toast.top - r.legend.bottom).toBeGreaterThanOrEqual(HUD_ISLAND_GAP_PX);
    }
    expect(r.legend.top).toBeGreaterThan(RIGHT_HUD_TOP_PX);
  });

  it("parks on the highest measured obstacle and ignores missing or empty ones", () => {
    const bar: HudBox = { left: 338, right: 1058, top: 632, bottom: 786 };
    const toast: HudBox = { left: 16, right: 436, top: 600, bottom: 638 };
    expect(transportLegendBottom(800, [bar])).toBe(176);
    expect(transportLegendBottom(800, [bar, toast])).toBe(208);
    expect(transportLegendBottom(800, [bar, null, { left: 0, right: 0, top: 10, bottom: 10 }])).toBe(176);
    expect(transportLegendBottom(800, [{ ...bar, top: 631.4 }])).toBe(177);
    expect(transportLegendBottom(800, [bar], 16)).toBe(184);
  });

  it("falls back to the island gap above the viewport edge with no obstacle", () => {
    expect(HUD_ISLAND_GAP_PX).toBe(8);
    expect(transportLegendBottom(800, [])).toBe(8);
    expect(transportLegendBottom(900, [null])).toBe(8);
  });
});
