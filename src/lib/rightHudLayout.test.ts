import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  envConsoleBox,
  envConsoleLanes,
  envConsoleMaxWidth,
  HUD_GUTTER_PX,
  RIGHT_HUD_GAP_PX,
  RIGHT_HUD_RIGHT_PX,
  RIGHT_HUD_TOP_PX,
  RIGHT_HUD_WIDTH_PX,
  rightHudMaxHeight,
  type HudBox,
} from "./rightHudLayout";

const stackAt = (vw: number, height = 600): HudBox => ({
  left: vw - RIGHT_HUD_RIGHT_PX - RIGHT_HUD_WIDTH_PX,
  right: vw - RIGHT_HUD_RIGHT_PX,
  top: RIGHT_HUD_TOP_PX,
  bottom: RIGHT_HUD_TOP_PX + height,
});
const rail: HudBox = { left: 14, right: 66, top: 68, bottom: 260 };
const outliner: HudBox = { left: 74, right: 322, top: 68, bottom: 820 };

function gapX(a: HudBox, b: HudBox): number {
  return Math.max(b.left - a.right, a.left - b.right);
}

const SITE_ONLY_HEIGHT = 366;
const tallStackAt = (vw: number, vh: number): HudBox => stackAt(vw, vh - RIGHT_HUD_TOP_PX - HUD_GUTTER_PX);
const barAt = (vh: number, height = 82): HudBox => ({
  left: 0,
  right: 720,
  top: vh - 14 - height,
  bottom: vh - 14,
});
const viewports = [
  [1280, 800],
  [1440, 900],
] as const;

describe("right HUD stack layout", () => {
  it("pins a 304px column 14px from the right and 68px from the top with a 12px gap and 16px gutters", () => {
    expect(RIGHT_HUD_WIDTH_PX).toBe(304);
    expect(RIGHT_HUD_RIGHT_PX).toBe(14);
    expect(RIGHT_HUD_TOP_PX).toBe(68);
    expect(RIGHT_HUD_GAP_PX).toBe(12);
    expect(HUD_GUTTER_PX).toBe(16);
  });

  it("runs the column to 16px above the bottom when the Analysis bar sits beside it in the lane", () => {
    for (const [vw, vh] of [
      [1280, 800],
      [1440, 900],
    ] as const) {
      const stack = tallStackAt(vw, vh);
      const lanes = envConsoleLanes(vw, { left: 0, right: 720, top: vh - 100, bottom: vh - 14 }, [rail, outliner], stack);
      const consoleBar = envConsoleBox(vw, lanes, 900, vh - 14 - 112, vh - 14);
      expect(rightHudMaxHeight(vh, stack, [consoleBar])).toBe(vh - 68 - 16);
    }
  });

  it("stops the column 16px above HUD that really overlaps it in X", () => {
    const stack = stackAt(1280);
    const under: HudBox = { left: 1100, right: 1200, top: 700, bottom: 786 };
    expect(rightHudMaxHeight(800, stack, [under])).toBe(700 - HUD_GUTTER_PX - RIGHT_HUD_TOP_PX);
  });

  it("ignores HUD above the column top, such as the top-bar compass", () => {
    const stack = stackAt(1440);
    const compass: HudBox = { left: 1300, right: 1342, top: 20, bottom: 62 };
    expect(rightHudMaxHeight(900, stack, [compass])).toBe(900 - 68 - 16);
  });

  it("locks the 1280x800 clash: outliner open, 304px stack, bar centred in a 608px lane", () => {
    const vw = 1280;
    const stack = tallStackAt(vw, 800);
    expect(stack.left).toBe(962);
    const lanes = envConsoleLanes(vw, { left: 0, right: 720, top: 800 - 14 - 76, bottom: 800 - 14 }, [rail, outliner], stack);
    expect(lanes).toEqual({ left: 322 + 16, right: vw - 962 + 16 });
    expect(envConsoleMaxWidth(vw, lanes)).toBe(962 - 322 - 32);
    expect(envConsoleMaxWidth(vw, lanes)).toBe(608);

    const wide = envConsoleBox(vw, lanes, 980, 800 - 14 - 112, 800 - 14);
    expect(wide.right - wide.left).toBe(608);
    expect((wide.left + wide.right) / 2).toBe((322 + 962) / 2);
    expect(wide.left - outliner.right).toBe(16);
    expect(gapX(wide, stack)).toBeGreaterThanOrEqual(16);
  });

  it("keeps the bar 16px clear of the outliner and stack at 1440x900", () => {
    const vw = 1440;
    const stack = tallStackAt(vw, 900);
    const lanes = envConsoleLanes(vw, { left: 0, right: 720, top: 900 - 14 - 76, bottom: 900 - 14 }, [rail, outliner], stack);
    const lane = envConsoleMaxWidth(vw, lanes);
    expect(lane).toBe(stack.left - outliner.right - 32);
    const bar = envConsoleBox(vw, lanes, 980, 900 - 14 - 112, 900 - 14);
    expect((bar.left + bar.right) / 2).toBe((outliner.right + stack.left) / 2);
    expect(bar.left - outliner.right).toBeGreaterThanOrEqual(16);
    expect(gapX(bar, stack)).toBeGreaterThanOrEqual(16);
    const narrow = envConsoleBox(vw, lanes, 500, 900 - 14 - 76, 900 - 14);
    expect(narrow.right - narrow.left).toBe(Math.min(720, lane));
  });

  it("uses the rail, or 16px from the edge, when the outliner does not reach the bar", () => {
    const stack = stackAt(1440);
    const bar: HudBox = { left: 0, right: 720, top: 900 - 14 - 76, bottom: 900 - 14 };
    const railLow: HudBox = { ...rail, bottom: 880 };
    expect(envConsoleLanes(1440, bar, [railLow, null], stack).left).toBe(66 + 16);
    expect(envConsoleLanes(1440, bar, [rail, null], stack).left).toBe(16);
  });

  it("centres the console on the full width when no right stack is open", () => {
    const consoleBar: HudBox = { left: 0, right: 720, top: 800, bottom: 886 };
    expect(envConsoleLanes(1440, consoleBar, [rail], null)).toEqual({ left: 16, right: 16 });
  });

  it("does not move the bar when a short Site Intelligence card opens or closes", () => {
    for (const [vw, vh] of viewports) {
      const site = stackAt(vw, SITE_ONLY_HEIGHT);
      expect(site.bottom).toBe(434);
      for (const height of [82, 118, 186]) {
        const bar = barAt(vh, height);
        expect(site.bottom + HUD_GUTTER_PX).toBeLessThan(bar.top);
        const open = envConsoleLanes(vw, bar, [rail, outliner], site);
        const closed = envConsoleLanes(vw, bar, [rail, outliner], null);
        expect(open).toEqual(closed);
        expect(open).toEqual({
          left: outliner.right + HUD_GUTTER_PX,
          right: 16,
        });
        expect(envConsoleBox(vw, open, 900, bar.top, bar.bottom)).toEqual(
          envConsoleBox(vw, closed, 900, bar.top, bar.bottom),
        );
      }
    }
    const bar = barAt(900);
    const lanes = envConsoleLanes(1440, bar, [rail, null], stackAt(1440, SITE_ONLY_HEIGHT));
    const box = envConsoleBox(1440, lanes, 720, bar.top, bar.bottom);
    expect((box.left + box.right) / 2).toBe(720);
  });

  it("reserves the right lane whenever an analysis card is in the stack, however short the stack is", () => {
    for (const [vw, vh] of viewports) {
      const bar = barAt(vh);
      const windOnly = stackAt(vw, 487);
      const reserved = {
        left: outliner.right + HUD_GUTTER_PX,
        right: RIGHT_HUD_RIGHT_PX + RIGHT_HUD_WIDTH_PX + HUD_GUTTER_PX,
      };
      if (windOnly.bottom + HUD_GUTTER_PX <= bar.top) {
        expect(envConsoleLanes(vw, bar, [rail, outliner], windOnly).right).toBe(16);
      }
      expect(envConsoleLanes(vw, bar, [rail, outliner], windOnly, true)).toEqual(reserved);
      expect(envConsoleLanes(vw, bar, [rail, outliner], stackAt(vw, 48), true)).toEqual(reserved);
      expect(envConsoleLanes(vw, bar, [rail, outliner], tallStackAt(vw, vh), true)).toEqual(reserved);
      expect(envConsoleLanes(vw, bar, [rail, outliner], null, true).right).toBe(16);
    }
  });

  it("still insets the bar beside a stack that overlaps it in Y, with no analysis-card flag", () => {
    for (const [vw, vh] of viewports) {
      for (const stackBottom of [vh - 84, vh - HUD_GUTTER_PX]) {
        const stack = stackAt(vw, stackBottom - RIGHT_HUD_TOP_PX);
        const bar = barAt(vh, 154);
        const lanes = envConsoleLanes(vw, bar, [rail, outliner], stack);
        expect(lanes.right).toBe(vw - stack.left + HUD_GUTTER_PX);
        const placed = envConsoleBox(vw, lanes, 980, bar.top, bar.bottom);
        expect(gapX(placed, stack)).toBeGreaterThanOrEqual(HUD_GUTTER_PX);
        expect(placed.left - outliner.right).toBeGreaterThanOrEqual(HUD_GUTTER_PX);
      }
    }
    const gutterOnly = stackAt(1280, 800 - 14 - 82 - 8 - RIGHT_HUD_TOP_PX);
    expect(envConsoleLanes(1280, barAt(800), [rail, outliner], gutterOnly).right).toBe(1280 - 962 + 16);
  });

  it("wraps the bar's second row and caps the bar at the lane instead of overflowing", () => {
    const floating = readFileSync(path.join(process.cwd(), "src/floating.css"), "utf8");
    const rule = (selector: string) => {
      const start = floating.indexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return floating.slice(start, floating.indexOf("}", start));
    };
    expect(rule(".model .bottom-bar.env-console .env-bottom-row")).toMatch(/flex-wrap: wrap !important;/);
    const bar = rule(".model .bottom-bar.env-console");
    expect(bar).toMatch(/max-width: var\(--env-console-lane\) !important;/);
    expect(bar).toMatch(/height: auto !important;/);
    expect(rule(".model .right-hud-stack")).toMatch(/calc\(100vh - 68px - var\(--space-4\)\)/);
  });
});
