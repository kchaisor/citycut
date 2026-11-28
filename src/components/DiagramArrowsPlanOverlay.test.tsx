// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrowTickerListeners, setArrowAnimationPaused } from "../lib/diagramArrowsMotion";
import type { DiagramArrow } from "../lib/diagramArrows";
import type { CityModel } from "../types";
import { DiagramArrowsPlanOverlay } from "./DiagramArrowsPlanOverlay";
import { createWindPlanTransformStore } from "./WindPlanOverlay";

afterEach(() => {
  cleanup();
  setArrowAnimationPaused(false);
  vi.unstubAllGlobals();
});

const arrow = (over: Partial<DiagramArrow>): DiagramArrow => ({
  id: "a",
  points: [[0, 0], [300, 0]],
  style: "bold",
  colour: "blue",
  width: 1,
  heightM: 20,
  animation: "none",
  speed: 1,
  showIn3d: true,
  showInDrawing: true,
  ...over,
});

describe("DiagramArrowsPlanOverlay", () => {
  it("renders a canvas inside a wind-plan-overlay layer after the wind map in DOM order, so capture composites it on top", () => {
    const store = createWindPlanTransformStore();
    const { container } = render(
      <div className="viewport">
        <div className="wind-plan-overlay"><canvas className="wind-plan-canvas" /></div>
        <DiagramArrowsPlanOverlay model={{ sideM: 1470 } as CityModel} arrows={[arrow({}), arrow({ id: "b", showIn3d: false })]} store={store} />
      </div>,
    );
    const canvases = [...container.querySelectorAll<HTMLCanvasElement>(".wind-plan-overlay canvas")];
    expect(canvases).toHaveLength(2);
    expect(canvases[1]!.closest(".diagram-arrows-plan")?.getAttribute("data-plan-arrows")).toBe("1");
  });

  it("stops its frame loop while paused", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 5));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<DiagramArrowsPlanOverlay model={{ sideM: 1470 } as CityModel} arrows={[arrow({ animation: "streaks" })]} store={createWindPlanTransformStore()} />);
    expect(arrowTickerListeners()).toBe(1);
    act(() => setArrowAnimationPaused(true));
    expect(arrowTickerListeners()).toBe(0);
    expect(window.__citycutDiagramArrowsAnim).toBeUndefined();
  });
});
