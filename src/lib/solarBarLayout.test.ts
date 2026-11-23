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
  leftOutlinerMaxHeight,
  type HudBox,
} from "./rightHudLayout";
import {
  ENV_CONSOLE_COMBINED_TOP_ROW_PX,
  ENV_CONSOLE_INSET_PX,
  ENV_CONSOLE_WIND_ROW_PX,
  envConsoleRowFits,
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

describe("Analysis bar with Solar Study and Wind Rose both on", () => {
  const rail: HudBox = { left: 14, right: 66, top: 68, bottom: 260 };
  const combinedBarWidthAt = (vw: number) => {
    const threeRows: HudBox = { left: 0, right: 0, top: VIEWPORT_HEIGHT - 132, bottom: VIEWPORT_HEIGHT - 14 };
    const lanes = envConsoleLanes(vw, threeRows, [rail, null], stackAt(vw, ANALYSIS_STACK_HEIGHT), true);
    return envConsoleMaxWidth(vw, lanes);
  };

  it("gets the lane from the left edge to the right column once the outliner clears the bar", () => {
    expect(combinedBarWidthAt(1280)).toBe(930);
    expect(combinedBarWidthAt(1440)).toBe(1090);
    const bar: HudBox = { left: 57, right: 905, top: 668, bottom: 786 };
    expect(leftOutlinerMaxHeight(bar, { left: 74, right: 322, top: 68, bottom: 734 })).toBe(668 - 16 - 68);
  });

  it("fits the top row, the solar row and the wind row on one line each at 1280 and 1440", () => {
    for (const vw of [1280, 1440]) {
      const width = combinedBarWidthAt(vw);
      expect(envConsoleRowFits(width, ENV_CONSOLE_COMBINED_TOP_ROW_PX), `${vw} top`).toBe(true);
      expect(envConsoleRowFits(width, ENV_CONSOLE_WIND_ROW_PX), `${vw} wind`).toBe(true);
      const solar = solarBottomRow(width, scrubberBasisFromCss);
      expect(solar.wrapped, `${vw} solar`).toBe(false);
      expect(solar.readoutClipPx, `${vw} readout`).toBe(0);
      expect(solar.readoutPastBarPx, `${vw} readout`).toBe(0);
    }
    expect(envConsoleRowFits(608, ENV_CONSOLE_COMBINED_TOP_ROW_PX)).toBe(false);
  });

  it("pins High / Fast on the first line, outside the part of the top row that wraps", () => {
    expect(rule(`${BAR} .env-top-row`)).toMatch(/flex-wrap: nowrap !important;/);
    expect(rule(`${BAR} .env-top-row`)).toMatch(/align-items: flex-start !important;/);
    expect(rule(`${BAR} .env-top-main`)).toMatch(/flex-wrap: wrap !important;/);
    expect(rule(`${BAR} .env-top-main`)).toMatch(/min-width: 0 !important;/);
    expect(rule(`${BAR} .env-quality`)).toMatch(/margin-left: auto !important;/);
    expect(rule(`${BAR} .env-quality`)).toMatch(/flex-shrink: 0 !important;/);
  });

  it("drops the solar readout text below 1600 wide and keeps the wind chips and Pause at the end of the wind row", () => {
    const combined = floating.slice(floating.indexOf("@media (max-width: 1599px)"));
    expect(combined.slice(0, combined.indexOf("}"))).toContain(`${BAR}.is-combined .env-solar-chrome .solar-telemetry`);
    expect(combined.slice(0, combined.indexOf("}"))).toContain("display: none !important;");
    expect(rule(`${BAR} .env-wind-end`)).toMatch(/margin-left: auto !important;/);
    expect(rule(`${BAR} .env-wind-end`)).toMatch(/flex-shrink: 0 !important;/);
  });

  it("lets the outliner stop above a combined bar instead of squeezing it", () => {
    expect(floating).toContain("max-height: min(calc(100vh - 134px), var(--left-outliner-max-height, 100vh));");
    const hook = readFileSync(path.resolve(process.cwd(), "src/components/model/useRightHudLayout.ts"), "utf8");
    expect(hook).toContain('classList.contains("is-combined")');
    expect(hook).toContain("outlinerYields ? null : outliner");
  });
});
