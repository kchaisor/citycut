// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NamedViewSnapshot } from "./namedViews";
import {
  WIND_SHEET_SIZES,
  containRect,
  contentBounds,
  trimmedFrame,
  drawWindSheet,
  isWindSheetView,
  windSheetInput,
  windSheetCropOption,
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

describe("windSheetCropOption", () => {
  it("asks for the main area's aspect and pixel width, bigger for high quality", () => {
    const normal = windSheetCropOption(false);
    const hq = windSheetCropOption(true);
    const main = windSheetLayout(2480, 1754).main;
    expect(normal.aspect).toBeCloseTo(main.width / main.height, 6);
    expect(normal.minWidthPx).toBe(main.width);
    expect(hq.minWidthPx).toBeGreaterThan(normal.minWidthPx * 1.9);
    expect(hq.aspect).toBeCloseTo(normal.aspect, 2);
  });
});

describe("drawWindSheet", () => {
  it("draws the site, view, season and time, prevailing, calm, station, source and CFD lines", () => {
    vi.stubGlobal("Path2D", class {});
    const input = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS - Spring");
    expect(input).not.toBeNull();
    const { ctx, texts } = stubContext();
    const layout = windSheetLayout(2480, 1754);
    drawWindSheet(ctx, layout, { source: {} as CanvasImageSource, width: 1200, height: 800, frame: null }, input!, STYLE, { transparent: false });
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

  it("puts the ring percentages in a key under the rose, never as labels on the rose", () => {
    vi.stubGlobal("Path2D", class {});
    const input = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS - Spring");
    const { ctx, texts } = stubContext();
    drawWindSheet(ctx, windSheetLayout(2480, 1754), { source: {} as CanvasImageSource, width: 1200, height: 800, frame: null }, input!, STYLE, { transparent: false });
    expect(texts).toContain("Rings 33% / 66%");
    expect(texts).not.toContain("33%");
    expect(texts).not.toContain("66%");
  });

  it.each([
    ["speed", 2480, 1754],
    ["comfort", 2480, 1754],
    ["speed", 4961, 3508],
    ["comfort", 4961, 3508],
  ] as const)("keeps the %s legend, scale bar and north arrow clear of the pinned notes at %i", (mode, width, height) => {
    vi.stubGlobal("Path2D", class {});
    const base = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS - Spring - Morning");
    const { ctx, texts } = stubContext();
    const frame = { metresAcross: 1470, northRad: 0 };
    const metrics = drawWindSheet(ctx, windSheetLayout(width, height), { source: {} as CanvasImageSource, width: 1600, height: 1100, frame }, { ...base!, mode }, STYLE, { transparent: false });
    expect(metrics.furniture).not.toBeNull();
    expect(metrics.furniture!.top).toBeGreaterThan(metrics.planLegendEnd);
    expect(metrics.furniture!.bottom).toBeLessThan(metrics.notesRule);
    expect(texts).toContain("250 m");
    expect(texts).toContain("0");
  });

  it("skips the scale bar and north arrow when the camera gives no frame", () => {
    vi.stubGlobal("Path2D", class {});
    const input = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS");
    const { ctx, texts } = stubContext();
    const metrics = drawWindSheet(ctx, windSheetLayout(2480, 1754), { source: {} as CanvasImageSource, width: 1600, height: 1100, frame: null }, input!, STYLE, { transparent: false });
    expect(metrics.furniture).toBeNull();
    expect(texts.some((value) => / m$/.test(value))).toBe(false);
  });

  it("sets the minimum text at 18 px on a 2480 px sheet and scales it with the sheet", () => {
    vi.stubGlobal("Path2D", class {});
    const fonts: string[] = [];
    const input = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS");
    const { ctx } = stubContext();
    const tracked = new Proxy(ctx, {
      set: (target, key, value) => {
        if (key === "font") fonts.push(String(value));
        (target as unknown as Record<string | symbol, unknown>)[key] = value;
        return true;
      },
    });
    drawWindSheet(tracked, windSheetLayout(2480, 1754), { source: {} as CanvasImageSource, width: 1600, height: 1100, frame: { metresAcross: 1470, northRad: 0 } }, input!, STYLE, { transparent: false });
    const sizes = fonts.map((font) => Number(/(\d+)px/.exec(font)?.[1])).filter((n) => n > 0);
    expect(Math.min(...sizes.filter((n) => n > 12))).toBe(18);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(55);
  });

  it("uses each view's own period and daypart and returns null without wind data", () => {
    const spring = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: null, comfortShares: null }, snapshot("spring", "morning"), "Site", "A");
    const winter = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: null, comfortShares: null }, snapshot("winter", "all"), "Site", "B");
    expect(spring?.seasonTimeLabel).toBe("Spring · Morning");
    expect(winter?.seasonTimeLabel).toBe("Winter · All day");
    expect(windSheetInput({ selection: null, scaleMaxMs: null, comfortShares: null }, snapshot("spring", "all"), "Site", "A")).toBeNull();
  });
});

function grid(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
}

describe("contentBounds", () => {
  const white: [number, number, number, number] = [255, 255, 255, 255];
  const blue: [number, number, number, number] = [10, 90, 200, 255];

  it("trims an opaque capture to the pixels that are not the background", () => {
    const image = grid(10, 8, (x, y) => (x >= 2 && x <= 6 && y >= 1 && y <= 5 ? blue : white));
    expect(contentBounds(image, { r: 255, g: 255, b: 255 })).toEqual({ x: 2, y: 1, width: 5, height: 5 });
  });

  it("treats near-background pixels within tolerance as background", () => {
    const image = grid(6, 6, (x, y) => (x === 3 && y === 3 ? blue : [253, 254, 255, 255]));
    expect(contentBounds(image, { r: 255, g: 255, b: 255 })).toEqual({ x: 3, y: 3, width: 1, height: 1 });
  });

  it("trims a transparent capture to alpha above zero", () => {
    const image = grid(8, 8, (x, y) => (x >= 1 && x <= 4 && y === 7 ? [255, 255, 255, 40] : [0, 0, 0, 0]));
    expect(contentBounds(image, null)).toEqual({ x: 1, y: 7, width: 4, height: 1 });
  });

  it("returns null when nothing is drawn and the full rect when content fills the capture", () => {
    expect(contentBounds(grid(4, 4, () => white), { r: 255, g: 255, b: 255 })).toBeNull();
    expect(contentBounds(grid(4, 3, () => blue), { r: 255, g: 255, b: 255 })).toEqual({ x: 0, y: 0, width: 4, height: 3 });
  });
});

describe("trimmedFrame", () => {
  it("scales metres across by the trimmed share of the capture width", () => {
    const frame = { metresAcross: 1000, northRad: 0.5 };
    expect(trimmedFrame(frame, 2000, { x: 100, y: 0, width: 1500, height: 900 })).toEqual({ metresAcross: 750, northRad: 0.5 });
    expect(trimmedFrame(frame, 2000, null)).toBe(frame);
  });

  it("keeps the scale bar true to the drawn pixels when the map is trimmed and refitted", () => {
    vi.stubGlobal("Path2D", class {});
    const input = windSheetInput({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }, snapshot("spring", "morning"), "Rozelle NSW", "WS");
    const layout = windSheetLayout(2480, 1754);
    const trim = { x: 200, y: 100, width: 1200, height: 1200 };
    const { ctx, texts } = stubContext();
    const rects: number[][] = [];
    const tracked = new Proxy(ctx, {
      get: (target, key: string) => (key === "strokeRect" ? (...args: number[]) => void rects.push(args) : (target as unknown as Record<string, unknown>)[key]),
    });
    drawWindSheet(tracked, layout, { source: {} as CanvasImageSource, width: 1600, height: 1400, frame: { metresAcross: 800, northRad: null }, trim }, input!, STYLE, { transparent: false });
    const image = containRect(trim.width, trim.height, layout.main);
    const metresPerPx = (800 * (trim.width / 1600)) / image.width;
    const bar = rects.find((rect) => rect[3] === Math.round(layout.unit));
    expect(texts).toContain("100 m");
    expect(bar![2]).toBeCloseTo(100 / metresPerPx, 5);
  });
});
