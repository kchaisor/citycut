import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  envConsoleBox,
  envConsoleLanes,
  envConsoleMaxWidth,
  RIGHT_HUD_RIGHT_PX,
  RIGHT_HUD_TOP_PX,
  RIGHT_HUD_WIDTH_PX,
  type HudBox,
} from "./rightHudLayout";
import {
  ENV_CONSOLE_INSET_PX,
  ENV_CONSOLE_SOLAR_CONTENT_PX,
  SOLAR_SCRUBBER_FLOOR_PX,
  solarBottomLeadWidth,
  solarBottomRow,
  solarScrubberContentWidth,
} from "./solarBarLayout";
import {
  SOLAR_SLIDER_FULL_TICKS_MIN_TRACK_PX,
  SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX,
  solarSliderTickHoursAt,
} from "./solarSlider";

const floating = readFileSync(path.resolve(process.cwd(), "src/floating.css"), "utf8");
const theme = readFileSync(path.resolve(process.cwd(), "src/theme.css"), "utf8");

function rule(selector: string): string {
  const start = floating.indexOf(`${selector} {`);
  return start < 0 ? "" : floating.slice(start, floating.indexOf("}", start));
}

const BAR = ".model .bottom-bar.env-console";
const solarScrubberRule = rule(`${BAR} .env-solar-bottom .daylight-scrubber`);
const scrubberBasisFromCss =
  /flex: 1 1 auto !important;/.test(solarScrubberRule) && /min-width: max-content !important;/.test(solarScrubberRule)
    ? solarScrubberContentWidth()
    : SOLAR_SCRUBBER_FLOOR_PX;

const VIEWPORT_HEIGHT = 900;
const SITE_CARD_HEIGHT = 366;
const ANALYSIS_STACK_HEIGHT = 700;
const outliner: HudBox = { left: 74, right: 322, top: 68, bottom: VIEWPORT_HEIGHT - 66 };
const consoleBox: HudBox = { left: 0, right: 0, top: VIEWPORT_HEIGHT - 168, bottom: VIEWPORT_HEIGHT - 14 };

const stackAt = (vw: number, height: number): HudBox => ({
  left: vw - RIGHT_HUD_RIGHT_PX - RIGHT_HUD_WIDTH_PX,
  right: vw - RIGHT_HUD_RIGHT_PX,
  top: RIGHT_HUD_TOP_PX,
  bottom: RIGHT_HUD_TOP_PX + height,
});

type RightColumn = "none" | "site" | "sun-hours" | "wind-rose" | "sun-hours+site";
const RIGHT_COLUMNS: readonly RightColumn[] = ["none", "site", "sun-hours", "wind-rose", "sun-hours+site"];
const VIEWPORTS = [1280, 1440, 1920] as const;

function barWidthAt(vw: number, column: RightColumn): number {
  const reserveRight = column !== "none" && column !== "site";
  const stack = column === "none" ? null : stackAt(vw, reserveRight ? ANALYSIS_STACK_HEIGHT : SITE_CARD_HEIGHT);
  const lanes = envConsoleLanes(vw, consoleBox, [outliner], stack, reserveRight);
  const box = envConsoleBox(vw, lanes, ENV_CONSOLE_SOLAR_CONTENT_PX, consoleBox.top, consoleBox.bottom);
  expect(box.right - box.left).toBeLessThanOrEqual(envConsoleMaxWidth(vw, lanes));
  return box.right - box.left;
}

describe("Analysis bar time readout", () => {
  it("gives the bar the lanes the brief measured", () => {
    expect(barWidthAt(1280, "sun-hours")).toBe(608);
    expect(barWidthAt(1440, "sun-hours")).toBe(768);
    expect(barWidthAt(1440, "wind-rose")).toBe(768);
    expect(barWidthAt(1440, "site")).toBe(1086);
    expect(barWidthAt(1440, "none")).toBe(1086);
    expect(barWidthAt(1920, "sun-hours")).toBe(ENV_CONSOLE_SOLAR_CONTENT_PX);
  });

  it("stuck out of the 768 px bar at 1440 while the slider row could shrink to its 192 px floor", () => {
    const broken = solarBottomRow(768, SOLAR_SCRUBBER_FLOOR_PX);
    expect(broken.wrapped).toBe(false);
    expect(broken.trackWidth).toBe(SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX);
    expect(broken.readoutClipPx).toBeGreaterThan(60);
    expect(broken.readoutPastBarPx).toBeGreaterThan(60);
    expect(broken.readoutPastBarPx).toBeLessThan(72);
  });

  it("keeps the readout whole and inside the bar at 1280, 1440 and 1920 with every right-column state", () => {
    for (const vw of VIEWPORTS) {
      for (const column of RIGHT_COLUMNS) {
        const row = solarBottomRow(barWidthAt(vw, column), scrubberBasisFromCss);
        expect(row.readoutPastBarPx, `${vw} ${column}`).toBe(0);
        expect(row.readoutClipPx, `${vw} ${column}`).toBe(0);
        expect(row.trackWidth, `${vw} ${column}`).toBeGreaterThanOrEqual(SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX);
      }
    }
  });

  it("wraps the slider under the date presets at 1440 with an analysis card, and shows every hour label", () => {
    const row = solarBottomRow(barWidthAt(1440, "sun-hours"), scrubberBasisFromCss);
    expect(row.wrapped).toBe(true);
    expect(row.scrubberWidth).toBe(768 - ENV_CONSOLE_INSET_PX * 2);
    expect(row.trackWidth).toBeGreaterThanOrEqual(SOLAR_SLIDER_FULL_TICKS_MIN_TRACK_PX);
  });

  it("does not force a wrap when the bar has room", () => {
    for (const column of RIGHT_COLUMNS) {
      expect(solarBottomRow(barWidthAt(1920, column), scrubberBasisFromCss).wrapped, `1920 ${column}`).toBe(false);
    }
    expect(solarBottomRow(barWidthAt(1440, "none"), scrubberBasisFromCss).wrapped).toBe(false);
    expect(solarBottomRow(barWidthAt(1440, "site"), scrubberBasisFromCss).wrapped).toBe(false);
  });

  it("still drops the in-between hours at 1280 with no analysis card", () => {
    const row = solarBottomRow(barWidthAt(1280, "none"), scrubberBasisFromCss);
    expect(row.wrapped).toBe(false);
    expect(solarSliderTickHoursAt(row.trackWidth)).toEqual([6, 9, 12, 15, 18, 20]);
  });

  it("always fits the slider row inside the narrowest desktop lane", () => {
    const narrowest = barWidthAt(1280, "sun-hours") - ENV_CONSOLE_INSET_PX * 2;
    expect(solarScrubberContentWidth()).toBeLessThanOrEqual(narrowest);
    expect(solarBottomLeadWidth()).toBeLessThanOrEqual(narrowest);
  });

  it("enforces the wrap in CSS: the solar slider row cannot shrink below its content", () => {
    expect(solarScrubberRule).toMatch(/flex: 1 1 auto !important;/);
    expect(solarScrubberRule).toMatch(/min-width: max-content !important;/);
    expect(scrubberBasisFromCss).toBe(solarScrubberContentWidth());
    const controlMd = Number(/--control-md: (\d+)px;/.exec(theme)?.[1]);
    expect(rule(`${BAR} .daylight-scrubber`)).toMatch(/min-width: calc\(var\(--control-md\) \* 6\) !important;/);
    expect(controlMd * 6).toBe(SOLAR_SCRUBBER_FLOOR_PX);
    expect(rule(`${BAR} .scrubber-track`)).toMatch(new RegExp(`min-width: ${SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX}px !important;`));
    expect(rule(`${BAR} .env-solar-bottom`)).toMatch(/flex-wrap: wrap !important;/);
    expect(rule(`${BAR} .env-bottom-row`)).toMatch(/flex-wrap: wrap !important;/);
  });

  it("never shrinks, wraps or clips the readout text", () => {
    const readout = rule(`${BAR} .time-readout-pill`);
    expect(readout).toMatch(/flex-shrink: 0 !important;/);
    expect(readout).toMatch(/white-space: nowrap !important;/);
    expect(readout).not.toMatch(/overflow: hidden|text-overflow/);
    expect(rule(BAR)).not.toMatch(/overflow(-x)?: (hidden|clip)/);
    expect(rule(`${BAR} .env-solar-bottom`)).not.toMatch(/overflow(-x)?: (hidden|clip)/);
  });
});
