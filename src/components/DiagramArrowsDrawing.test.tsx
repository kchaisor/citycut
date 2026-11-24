// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrowTickerListeners } from "../lib/diagramArrowsMotion";
import type { DiagramArrow } from "../lib/diagramArrows";
import { initialArrowToolState } from "../lib/diagramArrowsTool";
import type { CityModel } from "../types";
import { DiagramArrowsDrawing } from "./DiagramArrowsDrawing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DiagramArrowsDrawing labels", () => {
  it("renders each label as haloed SVG text", () => {
    const state = initialArrowToolState([
      {
        id: "a",
        points: [[0, 0], [100, 0]],
        style: "dashed",
        colour: "red",
        width: "m",
        heightM: 20,
        label: "Ferry route",
        animation: "none",
        showIn3d: true,
        showInDrawing: true,
      },
    ]);
    const { container } = render(
      <svg>
        <DiagramArrowsDrawing
          model={{ sideM: 1470 } as CityModel}
          state={state}
          dispatch={vi.fn()}
          svgRef={createRef<SVGSVGElement>()}
          viewWidthM={1470}
          viewHeightM={1470}
          hover={null}
        />
      </svg>,
    );
    const text = container.querySelector("text[data-arrow-label='a']")!;
    expect(text.textContent).toBe("Ferry route");
    expect(text.getAttribute("paint-order")).toBe("stroke");
    expect(Number(text.getAttribute("stroke-width"))).toBeGreaterThan(0);
  });
});

describe("DiagramArrowsDrawing animation", () => {
  const arrow = (animation: DiagramArrow["animation"]): DiagramArrow => ({
    id: "m",
    points: [[0, 0], [300, 0]],
    style: "bold",
    colour: "blue",
    width: "m",
    heightM: 20,
    label: "",
    animation,
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
});
