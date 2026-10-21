// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingPlan } from "./DrawingPlan";
import type { BuildingFeat, CityModel } from "../types";

const box = (id: number, e: number, n: number, extra: Partial<BuildingFeat> = {}): BuildingFeat => ({
  id,
  ring: [[e - 40, n - 40], [e + 40, n - 40], [e + 40, n + 40], [e - 40, n + 40], [e - 40, n - 40]],
  holes: [],
  height: 18,
  use: "unclassified",
  source: "none",
  ...extra,
});
const model = {
  sideM: 400,
  center: { lat: -37.8045, lon: 145.0215 },
  buildings: [box(1, -100, 100), box(2, 100, -100, { heightFromFallback: true })],
  roads: [],
  areas: [],
  trees: [],
  terrain: null,
} as unknown as CityModel;
const date = { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22 };
const view = { x: -200, y: -200, w: 400, h: 400 };

afterEach(cleanup);

function setup(selected: number[] = [], study: typeof date | null = date) {
  const onPick = vi.fn();
  const onView = vi.fn();
  const { container } = render(
    <DrawingPlan
      model={model}
      sunStudy={study}
      sunStudySelected={selected}
      onSunStudyPick={onPick}
      viewport={view}
      onViewportChange={onView}
    />,
  );
  const svg = container.querySelector("svg.plan") as SVGSVGElement;
  // 400 x 400 px box: one plan metre per pixel; no CTM in happy-dom, so the rect fallback is used.
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
  (svg as unknown as { getScreenCTM?: unknown }).getScreenCTM = undefined;
  svg.setPointerCapture = () => {};
  return { svg, onPick, onView, container };
}

describe("DrawingPlan sun study picking", () => {
  it("a click on a building picks it and leaves the view where it was", () => {
    const { svg, onPick, onView } = setup();
    // building 1 is centred at east -100, north +100 -> svg (-100, -100) -> pixel (100, 100)
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 102, clientY: 101, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 102, clientY: 101, pointerId: 1 });
    expect(onPick).toHaveBeenCalledWith(1);
    expect(onView).toHaveBeenLastCalledWith(view);
  });

  it("with the sun study off, a click neither picks nor resets the view (pan unchanged from before)", () => {
    const { svg, onPick, onView, container } = setup([2], null);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 102, clientY: 101, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 102, clientY: 101, pointerId: 1 });
    expect(onPick).not.toHaveBeenCalled();
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenLastCalledWith({ ...view, x: view.x - 2, y: view.y - 1 });
    expect(container.querySelectorAll("[data-selected-building], .sun-study-est").length).toBe(0);
  });

  it("a drag pans and picks nothing", () => {
    const { svg, onPick } = setup();
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 130, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 130, clientY: 100, pointerId: 1 });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("highlights selected buildings and labels estimated heights", () => {
    const { container } = setup([2]);
    expect([...container.querySelectorAll("[data-selected-building]")].map((el) => el.getAttribute("data-selected-building"))).toEqual(["2"]);
    expect([...container.querySelectorAll(".sun-study-est text")].map((t) => t.textContent)).toEqual(["~18 m est."]);
  });
});
