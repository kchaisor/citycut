// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArrowToolAction, ArrowToolState } from "../lib/diagramArrowsTool";
import { ModelPage } from "./ModelPage";
import type { CityModel } from "../types";

const probe = vi.hoisted(() => ({
  arrows: null as { state: ArrowToolState; dispatch: (action: ArrowToolAction) => void } | null,
}));

vi.mock("./Scene3D", () => ({
  Scene3D: ({ diagramArrows }: { diagramArrows?: { state: ArrowToolState; dispatch: (action: ArrowToolAction) => void } }) => {
    probe.arrows = diagramArrows ?? null;
    return <div data-testid="scene-3d" />;
  },
}));
vi.mock("./DrawingPlan", () => ({ DrawingPlan: () => <div data-testid="drawing-plan" /> }));
vi.mock("./DrawingExplodedAxo", () => ({ DrawingExplodedAxo: () => <div data-testid="drawing-exploded-axo" /> }));
vi.mock("./SatellitePane", () => ({ SatellitePane: () => <div data-testid="satellite-pane" /> }));

function sampleModel(): CityModel {
  return {
    placeLabel: "Toorak",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    stats: { buildings: 0, roads: 0, trees: 0 },
  } as unknown as CityModel;
}

function drawArrow() {
  act(() => {
    const { dispatch } = probe.arrows!;
    dispatch({ type: "beginDraft" });
    dispatch({ type: "addPoint", point: [0, 0] });
    dispatch({ type: "addPoint", point: [100, 0] });
    dispatch({ type: "finishDraft", id: "a" });
  });
}

describe("Arrows tool in the left rail", () => {
  beforeEach(() => {
    window.localStorage.clear();
    probe.arrows = null;
  });
  afterEach(cleanup);

  const rail = () => screen.getByRole("toolbar", { name: "Model tools" });

  it("sits right after Site and not in the bottom bar", () => {
    render(<ModelPage model={sampleModel()} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const names = within(rail())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    const site = names.indexOf("Site Intelligence");
    expect(site).toBeGreaterThanOrEqual(0);
    expect(names[site + 1]).toBe("Arrows");
    expect(names.filter((name) => name === "Arrows")).toHaveLength(1);
    const bottom = document.querySelector(".env-console");
    expect(bottom && within(bottom as HTMLElement).queryByRole("button", { name: "Arrows" })).toBeNull();
  });

  it("opens and closes the Arrows panel", () => {
    render(<ModelPage model={sampleModel()} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const button = within(rail()).getByRole("button", { name: "Arrows" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByLabelText("Arrows panel")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByLabelText("Arrows panel")).toBeTruthy();
    expect(within(rail()).getByRole("button", { name: "Arrows" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(rail()).getByRole("button", { name: "Arrows" }));
    expect(screen.queryByLabelText("Arrows panel")).toBeNull();
  });

  it("updates the arrow visibility state from Show in 3D and Show in Drawing", () => {
    render(<ModelPage model={sampleModel()} onHome={vi.fn()} onNewCut={vi.fn()} />);
    fireEvent.click(within(rail()).getByRole("button", { name: "Arrows" }));
    drawArrow();
    const panel = screen.getByLabelText("Arrows panel");
    expect(within(panel).getByText("Applies to the selected arrow.")).toBeTruthy();
    fireEvent.click(within(panel).getByLabelText("Show in 3D"));
    expect(probe.arrows!.state.arrows[0]).toMatchObject({ showIn3d: false, showInDrawing: true });
    fireEvent.click(within(panel).getByLabelText("Show in Drawing"));
    expect(probe.arrows!.state.arrows[0]).toMatchObject({ showIn3d: false, showInDrawing: false });
    fireEvent.click(within(panel).getByLabelText("Show in 3D"));
    expect(probe.arrows!.state.arrows[0]).toMatchObject({ showIn3d: true, showInDrawing: false });
  });
});
