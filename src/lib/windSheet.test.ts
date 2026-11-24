// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NamedViewSnapshot } from "./namedViews";
import {
  WIND_SHEET_SIZES,
  containRect,
  drawWindSheet,
  isWindSheetView,
  windSheetInput,
  windSheetLayout,
  type WindSheetStyle,
} from "./windSheet";
import { WIND_SHEET_SELECTION } from "./windSheetFixture";

type Flags = Pick<NamedViewSnapshot, "tab" | "view" | "analyses">;

function flags(tab: Flags["tab"], projection: Flags["view"]["projection"], wind: boolean): Flags {
  return {
    tab,
    view: { projection, corner: "ne", freeRotate: false },
    analyses: { solar: false, wind, view: false },
  };
}

const STYLE: WindSheetStyle = { page: "white", ink: "black", inkMuted: "grey", rule: "grey", sans: "sans-serif", mono: "monospace" };

function snapshot(period: NamedViewSnapshot["wind"]["period"], daypart: NamedViewSnapshot["wind"]["daypart"]): NamedViewSnapshot {
  return {
    ...flags("3d", "plan", true),
    wind: { enabled: false, period, designWind: null, daypart },
    windPlan: { mode: "speed", vectorsOn: true, sector: null },
  } as NamedViewSnapshot;
}

function stubContext() {
  const texts: string[] = [];
  const target: Record<string, unknown> = {
    measureText: (value: string) => ({ width: value.length * 9 }),
    fillText: (value: string) => void texts.push(value),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(target, {
    get: (store, key: string) => (key in store ? store[key] : () => undefined),
    set: (store, key: string, value) => {
      store[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

afterEach(() => vi.unstubAllGlobals());

describe("isWindSheetView", () => {
  it("is true for a 3D Plan view with Wind Rose on", () => {
    expect(isWindSheetView(flags("3d", "plan", true))).toBe(true);
  });

  it("is false for Plan with wind off, Perspective with wind on, Drawing and Satellite", () => {
    expect(isWindSheetView(flags("3d", "plan", false))).toBe(false);
    expect(isWindSheetView(flags("3d", "perspective", true))).toBe(false);
    expect(isWindSheetView(flags("3d", "iso", true))).toBe(false);
    expect(isWindSheetView(flags("drawing", "plan", true))).toBe(false);
    expect(isWindSheetView(flags("satellite", "plan", true))).toBe(false);
  });
});

describe("windSheetLayout", () => {
  it.each(Object.entries(WIND_SHEET_SIZES))("is A3 landscape with clear regions at %s size", (_, size) => {
    expect(Math.abs(size.width - (size.height * 420) / 297)).toBeLessThan(1);
    const layout = windSheetLayout(size.width, size.height);
    const { main, column, rose, margin } = layout;
    expect(main.x).toBeGreaterThanOrEqual(margin);
    expect(main.y).toBeGreaterThanOrEqual(margin);
    expect(main.y + main.height).toBeLessThanOrEqual(size.height - margin);
    expect(column.x + column.width).toBeLessThanOrEqual(size.width - margin);
    expect(main.x + main.width).toBeLessThan(column.x);
    expect(main.width / size.width).toBeGreaterThan(0.6);
    expect(main.width / size.width).toBeLessThan(0.75);
    expect(rose.x).toBeGreaterThanOrEqual(column.x);
    expect(rose.x + rose.width).toBeLessThanOrEqual(column.x + column.width);
    expect(rose.y + rose.height).toBeLessThanOrEqual(column.y + column.height);
  });

  it("fits a capture inside the main area without distortion", () => {
    const { main } = windSheetLayout(2480, 1754);
    const fitted = containRect(1000, 800, main);
    expect(fitted.width / fitted.height).toBeCloseTo(1.25, 2);
    expect(fitted.x).toBeGreaterThanOrEqual(main.x);
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(main.x + main.width);
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(main.y + main.height);
  });
});

describe("drawWindSheet", () => {
  it("draws the site, view, season and time, prevailing, calm, station, source and CFD lines", () => {
    vi.stubGlobal("Path2D", class {});
    const input = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS - Spring");
    expect(input).not.toBeNull();
    const { ctx, texts } = stubContext();
    const layout = windSheetLayout(2480, 1754);
    drawWindSheet(ctx, layout, { source: {} as CanvasImageSource, width: 1200, height: 800 }, input!, STYLE, { transparent: false });
    expect(texts).toContain("Rozelle NSW");
    expect(texts).toContain("WS - Spring");
    expect(texts).toContain("Spring · Morning");
    expect(texts).toContain(input!.prevailing);
    expect(texts).toContain("Calm 3.1%");
    expect(input!.stationLine).toContain("8.8 km · 2011–2025");
    expect(texts).toContain(input!.stationLine);
    expect(texts).toContain("climate.onebuilding.org TMYx");
    expect(texts).toContain("Indicative only, not a CFD study");
    expect(texts).toEqual(expect.arrayContaining(["N", "E", "S", "W"]));
  });

  it("uses each view's own period and daypart and returns null without wind data", () => {
    const spring = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: null, comfortShares: null }, snapshot("spring", "morning"), "Site", "A");
    const winter = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: null, comfortShares: null }, snapshot("winter", "all"), "Site", "B");
    expect(spring?.seasonTimeLabel).toBe("Spring · Morning");
    expect(winter?.seasonTimeLabel).toBe("Winter · All day");
    expect(windSheetInput({ selection: null, scaleMaxMs: null, comfortShares: null }, snapshot("spring", "all"), "Site", "A")).toBeNull();
  });
});
