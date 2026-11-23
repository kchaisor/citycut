// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NamedViewSnapshot } from "../../lib/namedViews";
import type { CityModel } from "../../types";
import { useNamedViews } from "./useNamedViews";

const downloads = vi.hoisted(() => ({ downloadBytes: vi.fn() }));
vi.mock("../../lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/download")>()),
  downloadBytes: downloads.downloadBytes,
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
    }),
  );
  return { hook, applied, png };
}

describe("useNamedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
    downloads.downloadBytes.mockClear();
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
