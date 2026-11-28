import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  envConsoleBox,
  envConsoleLanes,
  envConsoleMaxWidth,
  HUD_GUTTER_PX,
  RIGHT_HUD_RIGHT_PX,
  RIGHT_HUD_TOP_PX,
  RIGHT_HUD_WIDTH_PX,
  rightHudMaxHeight,
  type HudBox,
} from "./rightHudLayout";
import {
  ENV_CONSOLE_INSET_PX,
  ENV_CONSOLE_ONE_ROW_CONTENT_PX,
  ENV_CONSOLE_ROW_PX,
  envConsoleBarWidth,
  envConsoleRowFits,
} from "./solarBarLayout";

const floating = readFileSync(path.resolve(process.cwd(), "src/floating.css"), "utf8");
const theme = readFileSync(path.resolve(process.cwd(), "src/theme.css"), "utf8");

function rule(selector: string): string {
  const start = floating.indexOf(`${selector} {`);
  return start < 0 ? "" : floating.slice(start, floating.indexOf("}", start));
}

const BAR = ".model .bottom-bar.env-console";
const BAR_BOTTOM_PX = 14;
const outlinerAt = (vh: number): HudBox => ({ left: 74, right: 322, top: 68, bottom: vh - 66 });
const stackAt = (vw: number, height: number): HudBox => ({
  left: vw - RIGHT_HUD_RIGHT_PX - RIGHT_HUD_WIDTH_PX,
  right: vw - RIGHT_HUD_RIGHT_PX,
  top: RIGHT_HUD_TOP_PX,
  bottom: RIGHT_HUD_TOP_PX + height,
});

type RightColumn = "none" | "site" | "analysis";
const VIEWPORTS = [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const;

function analysisStackHeight(vw: number, vh: number, bar: HudBox): number {
  return rightHudMaxHeight(vh, stackAt(vw, vh), [bar], bar);
}

function barAt(vw: number, vh: number, column: RightColumn): { bar: HudBox; lane: number } {
  const height = ENV_CONSOLE_ROW_PX + ENV_CONSOLE_INSET_PX * 2;
  const measured: HudBox = { left: 0, right: envConsoleBarWidth(), top: vh - BAR_BOTTOM_PX - height, bottom: vh - BAR_BOTTOM_PX };
  const stack = column === "none" ? null : stackAt(vw, column === "analysis" ? analysisStackHeight(vw, vh, measured) : 366);
  const lanes = envConsoleLanes(vw, measured, [outlinerAt(vh)], stack);
  return { bar: envConsoleBox(vw, lanes, envConsoleBarWidth(), measured.top, measured.bottom), lane: envConsoleMaxWidth(vw, lanes) };
}

describe("one-row Analysis bar", () => {
  it("is a 54px bar: one 28px row inside 12px padding and a 1px border", () => {
    expect(ENV_CONSOLE_ROW_PX).toBe(28);
    expect(theme).toMatch(/--control-sm: 28px;/);
    expect(rule(`${BAR} .env-top-row`)).toMatch(/min-height: var\(--control-sm\) !important;/);
    expect(rule(BAR)).toMatch(/padding: var\(--space-3\) !important;/);
    expect(theme).toMatch(/--space-3: 12px;/);
    expect(ENV_CONSOLE_INSET_PX).toBe(12 + 1);
    expect(envConsoleBarWidth()).toBe(ENV_CONSOLE_ONE_ROW_CONTENT_PX + 26);
  });

  it("fits its toggles and High / Fast on one row at 1280, 1440 and 1920 with every right-column state", () => {
    for (const [vw, vh] of VIEWPORTS) {
      for (const column of ["none", "site", "analysis"] as const) {
        const { bar, lane } = barAt(vw, vh, column);
        const label = `${vw} ${column}`;
        expect(lane, label).toBeGreaterThanOrEqual(envConsoleBarWidth());
        expect(bar.right - bar.left, label).toBe(envConsoleBarWidth());
        expect(envConsoleRowFits(bar.right - bar.left, ENV_CONSOLE_ONE_ROW_CONTENT_PX), label).toBe(true);
        expect(bar.left - outlinerAt(vh).right, label).toBeGreaterThanOrEqual(HUD_GUTTER_PX);
      }
    }
  });

  it("keeps the same lane with or without analysis cards, because the column stops above the bar", () => {
    for (const [vw, vh] of VIEWPORTS) {
      expect(barAt(vw, vh, "analysis").lane, String(vw)).toBe(vw - 338 - 16);
      expect(barAt(vw, vh, "analysis").bar, String(vw)).toEqual(barAt(vw, vh, "none").bar);
    }
  });

  it("leaves the 328px analysis column about 650 to 750px of height at 800 and 900 tall, 16px above the bar", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { bar } = barAt(vw, vh, "analysis");
      const height = analysisStackHeight(vw, vh, bar);
      expect(RIGHT_HUD_TOP_PX + height, String(vw)).toBe(bar.top - HUD_GUTTER_PX);
    }
    expect(analysisStackHeight(1440, 900, barAt(1440, 900, "analysis").bar)).toBe(900 - 68 - 14 - 54 - 16);
    expect(analysisStackHeight(1280, 800, barAt(1280, 800, "analysis").bar)).toBe(648);
  });

  it("sizes to its content with no slider-row minimum, and never clips", () => {
    expect(rule(BAR)).toMatch(/width: max-content !important;/);
    expect(rule(BAR)).not.toMatch(/min-width/);
    expect(rule(BAR)).not.toMatch(/overflow(-x)?: (hidden|clip)/);
    expect(rule(`${BAR} .env-top-row`)).toMatch(/flex-wrap: nowrap !important;/);
    expect(rule(`${BAR} .env-quality`)).toMatch(/flex-shrink: 0 !important;/);
  });

  it("no longer asks the outliner to stop above the bar", () => {
    expect(floating).not.toContain("--left-outliner-max-height");
    const hook = readFileSync(path.resolve(process.cwd(), "src/components/model/useRightHudLayout.ts"), "utf8");
    expect(hook).not.toContain("is-combined");
    expect(hook).toContain("[box(railEl), box(outlinerEl)]");
  });
});
