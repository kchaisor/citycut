// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NamedViewSnapshot } from "../../lib/namedViews";
import type { CityModel } from "../../types";
import { WIND_SHEET_SELECTION } from "../../lib/windSheetFixture";
import { useNamedViews } from "./useNamedViews";

const downloads = vi.hoisted(() => ({ downloadBytes: vi.fn() }));
vi.mock("../../lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/download")>()),
  downloadBytes: downloads.downloadBytes,
}));

const sheets = vi.hoisted(() => ({ composeWindSheet: vi.fn() }));
vi.mock("../../lib/windSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/windSheet")>()),
  composeWindSheet: sheets.composeWindSheet,
}));

const MODEL = { center: { lat: -37.81, lon: 144.96 }, sideM: 500, placeLabel: "Melbourne" } as unknown as CityModel;

function snapshot(tab: NamedViewSnapshot["tab"], corner: NamedViewSnapshot["view"]["corner"] = "ne"): NamedViewSnapshot {
  return {
    view: { projection: "iso", corner, freeRotate: false },
    pose: null,
    tab,
    drawing: "site",
    analyses: { solar: false, wind: false, view: false },
    solar: { showPath: false, castShadows: false, radiusFactor: 1, year: 2026, month: 6, day: 21, hour: 12, minute: 0 },
    wind: { enabled: false, period: "annual", designWind: null, daypart: "all" },
    windStreaksOn: false,
    windPlan: { mode: "speed", vectorsOn: true, sector: null },
    renderQuality: "high",
    sunDomeSizeM: null,
    viewshed: { eyeM: 1.6, radiusM: 250 },
    sunStudySelected: [],
    display: { primaryView: true, showOutlines: true, showContours3d: true, hideTrees: false },
    colourByUse: false,
    showSource: false,
    hiddenUses: [],
    landmarkLabelsOn: false,
    lineStyles: null,
    exploded: false,
    explodeGapM: null,
  };
}

function windPlanSnapshot(period: NamedViewSnapshot["wind"]["period"], daypart: NamedViewSnapshot["wind"]["daypart"]): NamedViewSnapshot {
  return {
    ...snapshot("3d"),
    view: { projection: "plan", corner: "ne", freeRotate: false },
    analyses: { solar: false, wind: true, view: false },
    wind: { enabled: false, period, designWind: null, daypart },
  };
}

function mount(live: { current: NamedViewSnapshot }, waitUntilReady?: (snapshot: NamedViewSnapshot) => Promise<void>) {
  const applied: NamedViewSnapshot[] = [];
  const png = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
  const hook = renderHook(() =>
    useNamedViews({
      model: MODEL,
      getSnapshot: () => live.current,
      applySnapshot: async (next) => {
        applied.push(next);
        live.current = next;
      },
      getExporter: () => ({ png: vi.fn(), viewportPng: png, shot: vi.fn() }),
      waitUntilReady,
      getWindSheetSource: () => ({ selection: WIND_SHEET_SELECTION, scaleMaxMs: 8, comfortShares: null }),
    }),
  );
  return { hook, applied, png };
}

describe("useNamedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
    downloads.downloadBytes.mockClear();
    sheets.composeWindSheet.mockReset();
    sheets.composeWindSheet.mockResolvedValue(new Uint8Array([9, 9]));
  });
  afterEach(cleanup);

  it("saves the live state and restores that snapshot on click", () => {
    const live = { current: snapshot("3d", "sw") };
    const { hook, applied } = mount(live);
    act(() => void hook.result.current.save("Corner"));
    live.current = snapshot("3d", "ne");
    act(() => hook.result.current.restore(hook.result.current.views[0]!.id));
    expect(applied).toHaveLength(1);
    expect(applied[0]!.view.corner).toBe("sw");
  });

  it("exports one ticked 3D view as a PNG and puts the live state back", async () => {
    const live = { current: snapshot("3d", "ne") };
    const { hook, applied, png } = mount(live);
    act(() => void hook.result.current.save("Plaza"));
    act(() => void hook.result.current.save("Other"));
    const plaza = hook.result.current.views.find((v) => v.name === "Plaza")!;
    act(() => hook.result.current.exportSelected([plaza.id]));
    await waitFor(() => expect(downloads.downloadBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.busy).toBeNull());
    expect(png).toHaveBeenCalledTimes(1);
    expect(downloads.downloadBytes.mock.calls[0]![0]).toBe("Plaza.png");
    expect(downloads.downloadBytes.mock.calls[0]![2]).toBe("image/png");
    expect(applied).toHaveLength(2);
  });

  it("composes an A3 wind sheet per Plan wind view from its own season and time, and leaves other views alone", async () => {
    const live = { current: windPlanSnapshot("spring", "morning") };
    const { hook, applied, png } = mount(live);
    act(() => void hook.result.current.save("WS - Spring"));
    live.current = windPlanSnapshot("winter", "afternoon");
    act(() => void hook.result.current.save("WS - Winter"));
    live.current = snapshot("3d");
    act(() => void hook.result.current.save("Axo"));
    live.current = snapshot("3d", "sw");
    act(() => hook.result.current.exportAll(true));
    await waitFor(() => expect(downloads.downloadBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.busy).toBeNull());
    expect(png).toHaveBeenCalledTimes(3);
    expect(sheets.composeWindSheet).toHaveBeenCalledTimes(2);
    const labels = sheets.composeWindSheet.mock.calls.map(([, input, options]) => [input.viewName, input.seasonTimeLabel, options.highQuality]);
    expect(labels).toEqual(
      expect.arrayContaining([
        ["WS - Spring", "Spring · Morning", true],
        ["WS - Winter", "Winter · Afternoon", true],
      ]),
    );
    expect(sheets.composeWindSheet.mock.calls[0]![1].siteName).toBe("Melbourne");
    const entries = downloads.downloadBytes.mock.calls[0]![1] as Uint8Array;
    expect(entries.length).toBeGreaterThan(0);
    expect(applied.at(-1)).toEqual(snapshot("3d", "sw"));
  });

  it("exports a non-wind view through the plain PNG path", async () => {
    const live = { current: snapshot("3d") };
    const { hook } = mount(live);
    act(() => void hook.result.current.save("Axo"));
    act(() => hook.result.current.exportAll());
    await waitFor(() => expect(downloads.downloadBytes).toHaveBeenCalledTimes(1));
    expect(sheets.composeWindSheet).not.toHaveBeenCalled();
    expect(Array.from(downloads.downloadBytes.mock.calls[0]![1] as Uint8Array)).toEqual([1, 2, 3]);
  });

  it("zips every view on Export all and skips non-3D views with a reason", async () => {
    const live = { current: snapshot("3d") };
    const { hook, png } = mount(live);
    act(() => void hook.result.current.save("One"));
    act(() => void hook.result.current.save("Two"));
    live.current = snapshot("satellite");
    act(() => void hook.result.current.save("Map"));
    act(() => hook.result.current.exportAll());
    await waitFor(() => expect(downloads.downloadBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.busy).toBeNull());
    expect(png).toHaveBeenCalledTimes(2);
    expect(downloads.downloadBytes.mock.calls[0]![0]).toMatch(/-views\.zip$/);
    expect(hook.result.current.warning).toContain("1 view skipped");
  });

  it("does nothing when nothing is ticked and warns when only non-3D views are picked", async () => {
    const live = { current: snapshot("satellite") };
    const { hook, png } = mount(live);
    act(() => void hook.result.current.save("Map"));
    act(() => hook.result.current.exportSelected([]));
    expect(hook.result.current.warning).toBeNull();
    act(() => hook.result.current.exportAll());
    await waitFor(() => expect(hook.result.current.warning).toContain("Only 3D views"));
    expect(png).not.toHaveBeenCalled();
    expect(downloads.downloadBytes).not.toHaveBeenCalled();
  });

  it("keeps lists apart by cut size", () => {
    const live = { current: snapshot("3d") };
    const { hook } = mount(live);
    act(() => void hook.result.current.save("A"));
    const other = renderHook(() =>
      useNamedViews({
        model: { ...MODEL, sideM: 1000 } as CityModel,
        getSnapshot: () => live.current,
        applySnapshot: async () => {},
        getExporter: () => null,
      }),
    );
    expect(other.result.current.views).toEqual([]);
    expect(hook.result.current.views).toHaveLength(1);
  });

  it("does not capture until the study reports ready", async () => {
    const live = { current: snapshot("3d") };
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waitUntilReady = vi.fn(() => gate);
    const { hook, png } = mount(live, waitUntilReady);
    act(() => void hook.result.current.save("Study"));
    act(() => hook.result.current.exportAll());
    await waitFor(() => expect(waitUntilReady).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(png).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(png).toHaveBeenCalledTimes(1));
  });

  it("asks for a high quality transparent capture only when the toggle is on", async () => {
    const live = { current: snapshot("3d") };
    const { hook, png } = mount(live);
    act(() => void hook.result.current.save("One"));
    act(() => hook.result.current.exportAll(false));
    await waitFor(() => expect(hook.result.current.busy).toBeNull());
    expect(png).toHaveBeenLastCalledWith(undefined);
    act(() => hook.result.current.exportAll(true));
    await waitFor(() => expect(png).toHaveBeenCalledTimes(2));
    const options = (png.mock.calls[1] as unknown[])[0] as { transparent: boolean; scale: number };
    expect(options.transparent).toBe(true);
    expect(options.scale).toBeGreaterThanOrEqual(2);
  });
});

describe("useNamedViews with the exploded axo", () => {
  beforeEach(() => {
    window.localStorage.clear();
    downloads.downloadBytes.mockClear();
  });
  afterEach(cleanup);

  function exploded(gap: number): NamedViewSnapshot {
    return { ...snapshot("3d"), exploded: true, explodeGapM: gap };
  }

  it("captures each view in its own exploded state and puts the original back exploded", async () => {
    const live = { current: snapshot("3d") };
    const log: string[] = [];
    const png = vi.fn(async () => {
      log.push(`capture:${live.current.exploded ? "exploded" : "assembled"}:${live.current.explodeGapM}`);
      return new Blob([new Uint8Array([1])], { type: "image/png" });
    });
    const hook = renderHook(() =>
      useNamedViews({
        model: MODEL,
        getSnapshot: () => live.current,
        applySnapshot: async (next) => {
          log.push(`apply:${next.exploded ? "exploded" : "assembled"}`);
          live.current = next;
        },
        getExporter: () => ({ png: vi.fn(), viewportPng: png, shot: vi.fn() }),
      }),
    );
    live.current = exploded(120);
    act(() => void hook.result.current.save("Stack"));
    live.current = snapshot("3d", "sw");
    act(() => void hook.result.current.save("Flat"));
    live.current = { ...snapshot("3d", "nw"), exploded: true, explodeGapM: 200 };
    const original = live.current;
    log.length = 0;
    act(() => hook.result.current.exportAll());
    await waitFor(() => expect(downloads.downloadBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.busy).toBeNull());
    expect(log).toEqual([
      "apply:assembled",
      "capture:assembled:null",
      "apply:exploded",
      "capture:exploded:120",
      "apply:exploded",
    ]);
    expect(live.current).toEqual(original);
  });

  it("waits for the exploded stack to settle before capturing an exploded view", async () => {
    const live = { current: exploded(120) };
    let settled = false;
    const { hook, png } = mount(live, async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      settled = true;
    });
    act(() => void hook.result.current.save("Stack"));
    png.mockImplementationOnce(async () => {
      expect(settled).toBe(true);
      return new Blob([new Uint8Array([1])], { type: "image/png" });
    });
    act(() => hook.result.current.exportAll());
    await waitFor(() => expect(downloads.downloadBytes).toHaveBeenCalledTimes(1));
    expect(png).toHaveBeenCalledTimes(1);
  });
});
