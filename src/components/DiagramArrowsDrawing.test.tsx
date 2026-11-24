// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrowTickerListeners, setArrowAnimationPaused } from "../lib/diagramArrowsMotion";
import { parseDiagramArrows, type DiagramArrow } from "../lib/diagramArrows";
import { initialArrowToolState } from "../lib/diagramArrowsTool";
import type { CityModel } from "../types";
import { DiagramArrowsDrawing } from "./DiagramArrowsDrawing";

afterEach(() => {
  cleanup();
  setArrowAnimationPaused(false);
  vi.unstubAllGlobals();
});

describe("DiagramArrowsDrawing labels and visibility", () => {
  const stored = (over: Record<string, unknown> = {}) =>
    parseDiagramArrows([
      { id: "a", points: [[0, 0], [100, 0]], style: "dashed", colour: "red", width: "m", heightM: 20, label: "Ferry route", ...over },
    ]);

  function mountArrows(arrows: DiagramArrow[]) {
    return render(
      <svg>
        <DiagramArrowsDrawing
          model={{ sideM: 1470 } as CityModel}
          state={initialArrowToolState(arrows)}
          dispatch={vi.fn()}
          svgRef={createRef<SVGSVGElement>()}
          viewWidthM={1470}
          viewHeightM={1470}
          hover={null}
        />
      </svg>,
    );
  }

  it("draws no label text for an arrow stored with a legacy label", () => {
    const { container } = mountArrows(stored());
    expect(container.querySelector("polygon, path, circle")).toBeTruthy();
    expect(container.querySelector("text")).toBeNull();
    expect(container.textContent).not.toContain("Ferry route");
  });

  it("draws nothing for an arrow that is hidden in Drawing", () => {
    const { container } = mountArrows(stored({ showInDrawing: false }));
    expect(container.querySelector("polygon, path, circle")).toBeNull();
  });

  it("draws the arrow while it is shown in Drawing even when hidden in 3D", () => {
    const { container } = mountArrows(stored({ showIn3d: false }));
    expect(container.querySelector("polygon, path, circle")).toBeTruthy();
  });
});

describe("DiagramArrowsDrawing animation", () => {
  const arrow = (animation: DiagramArrow["animation"]): DiagramArrow => ({
    id: "m",
    points: [[0, 0], [300, 0]],
    style: "bold",
    colour: "blue",
    width: 1,
    heightM: 20,
    animation,
    speed: 1,
    showIn3d: true,
    showInDrawing: true,
  });

  function mount(animation: DiagramArrow["animation"]) {
    return render(
      <svg>
        <DiagramArrowsDrawing
          model={{ sideM: 1470 } as CityModel}
          state={initialArrowToolState([arrow(animation)])}
          dispatch={vi.fn()}
          svgRef={createRef<SVGSVGElement>()}
          viewWidthM={1470}
          viewHeightM={1470}
          hover={null}
        />
      </svg>,
    );
  }

  it("requests no frames and publishes nothing when no arrow animates", () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    const { container } = mount("none");
    expect(raf).not.toHaveBeenCalled();
    expect(arrowTickerListeners()).toBe(0);
    expect(window.__citycutDiagramArrowsAnim).toBeUndefined();
    expect(container.querySelector("[data-arrow-animation]")).toBeNull();
  });

  it("runs one frame loop while an arrow animates and stops it on unmount", () => {
    const raf = vi.fn(() => 7);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const view = mount("streaks");
    expect(raf).toHaveBeenCalledTimes(1);
    expect(arrowTickerListeners()).toBe(1);
    expect(window.__citycutDiagramArrowsAnim?.animated).toBe(1);
    expect(view.container.querySelector("[data-arrow-animation='streaks']")).toBeTruthy();
    view.unmount();
    expect(arrowTickerListeners()).toBe(0);
    expect(window.__citycutDiagramArrowsAnim).toBeUndefined();
  });

  it("draws a static arrow and requests no frames under prefers-reduced-motion", () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = mount("draw-on");
    expect(raf).not.toHaveBeenCalled();
    expect(arrowTickerListeners()).toBe(0);
    expect(window.__citycutDiagramArrowsAnim).toBeUndefined();
    expect(container.querySelectorAll("polygon")).toHaveLength(2);
  });

  it("renders static and stops the frame loop while paused, and resumes on play", () => {
    const raf = vi.fn(() => 3);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = mount("draw-on");
    expect(arrowTickerListeners()).toBe(1);
    act(() => setArrowAnimationPaused(true));
    expect(window.__citycutDiagramArrowsPaused).toBe(true);
    expect(arrowTickerListeners()).toBe(0);
    expect(window.__citycutDiagramArrowsAnim).toBeUndefined();
    expect(container.querySelectorAll("polygon")).toHaveLength(2);
    act(() => setArrowAnimationPaused(false));
    expect(window.__citycutDiagramArrowsPaused).toBe(false);
    expect(arrowTickerListeners()).toBe(1);
  });
});
