// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrowAnimationPaused, setArrowAnimationPaused } from "../../lib/diagramArrowsMotion";
import { parseDiagramArrows, type DiagramArrow } from "../../lib/diagramArrows";
import { initialArrowToolState } from "../../lib/diagramArrowsTool";
import { ArrowsHudCard } from "./ArrowsHudCard";

afterEach(() => {
  cleanup();
  setArrowAnimationPaused(false);
});

describe("ArrowsHudCard", () => {
  const card = (arrows: DiagramArrow[] = [], dispatch = vi.fn()) => {
    const selectedId = arrows[0]?.id ?? null;
    render(<ArrowsHudCard arrows={{ state: { ...initialArrowToolState(arrows), active: true, selectedId }, dispatch }} />);
    return dispatch;
  };
  const stored = (over: Record<string, unknown> = {}) =>
    parseDiagramArrows([{ id: "a", points: [[0, 0], [100, 0]], style: "bold", width: 1.4, heightM: 30, speed: 2, ...over }]);

  it("lists the eight styles in a named group and patches the style", () => {
    const dispatch = card();
    const group = screen.getByRole("group", { name: "Arrow style" });
    const names = ["Streak", "Tapered flow", "Bold", "Line", "Dashed", "Dotted", "Chevron run", "Double"];
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(names);
    for (const name of names) expect(within(group).getByRole("button", { name })).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Tapered flow" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { style: "tapered" } });
    fireEvent.click(within(group).getByRole("button", { name: "Chevron run" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { style: "chevron" } });
  });

  it("has Width, Height and Animation speed sliders that patch numbers and no Label field", () => {
    const dispatch = card();
    expect(screen.queryByLabelText(/label/i)).toBeNull();
    expect(document.getElementById("arrow-label")).toBeNull();
    const width = screen.getByLabelText("Arrow width") as HTMLInputElement;
    const height = screen.getByLabelText("Height (m)") as HTMLInputElement;
    const speed = screen.getByLabelText("Animation speed") as HTMLInputElement;
    for (const slider of [width, height, speed]) expect(slider.type).toBe("range");
    fireEvent.change(width, { target: { value: "1.8" } });
    fireEvent.change(height, { target: { value: "75" } });
    fireEvent.change(speed, { target: { value: "2.5" } });
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { width: 1.8 } });
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { heightM: 75 } });
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { speed: 2.5 } });
  });

  it("shows the selected arrow's width, height and speed", () => {
    card(stored());
    expect((screen.getByLabelText("Arrow width") as HTMLInputElement).value).toBe("1.4");
    expect((screen.getByLabelText("Height (m)") as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText("Animation speed") as HTMLInputElement).value).toBe("2");
  });

  it("toggles Show in 3D and Show in Drawing and says whom they apply to", () => {
    const dispatch = card();
    expect(screen.getByText("Applies to the next arrow.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Show in 3D"));
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { showIn3d: false } });
    fireEvent.click(screen.getByLabelText("Show in Drawing"));
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { showInDrawing: false } });
  });

  it("reflects the selected arrow's visibility in the checkboxes", () => {
    card(stored({ showIn3d: false }));
    expect(screen.getByText("Applies to the selected arrow.")).toBeTruthy();
    expect((screen.getByLabelText("Show in 3D") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Show in Drawing") as HTMLInputElement).checked).toBe(true);
  });

  it("puts the arrow style picker first in the card", () => {
    render(<ArrowsHudCard arrows={{ state: { ...initialArrowToolState(), active: true }, dispatch: vi.fn() }} />);
    const body = document.querySelector(".analysis-card-body")!;
    expect(body.firstElementChild?.querySelector("[aria-label='Arrow style']")).toBeTruthy();
  });

  it("has no animation placeholder note and a Done button", () => {
    const dispatch = vi.fn();
    render(<ArrowsHudCard arrows={{ state: { ...initialArrowToolState(), active: true }, dispatch }} />);
    expect(screen.queryByText("Animation preview comes next")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setActive", active: false });
  });

  it("toggles pause and play with an accessible name and aria-pressed", () => {
    render(<ArrowsHudCard arrows={{ state: { ...initialArrowToolState(), active: true }, dispatch: vi.fn() }} />);
    const pause = screen.getByRole("button", { name: "Pause arrow animation" });
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pause);
    const play = screen.getByRole("button", { name: "Play arrow animation" });
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(arrowAnimationPaused()).toBe(true);
    expect(window.__citycutDiagramArrowsPaused).toBe(true);
    expect(sessionStorage.getItem("citycut.diagramArrows.paused.v1")).toBe("1");
    fireEvent.click(play);
    expect(arrowAnimationPaused()).toBe(false);
    expect(sessionStorage.getItem("citycut.diagramArrows.paused.v1")).toBeNull();
  });
});

describe("ArrowsHudCard profile controls", () => {
  const stored = () =>
    parseDiagramArrows([{ id: "a", points: [[0, 0], [100, 0], [200, 0]] }]);
  const mount = (over: Partial<ReturnType<typeof initialArrowToolState>> = {}, groundAt?: (east: number, north: number) => number) => {
    const dispatch = vi.fn();
    const arrows = stored();
    render(
      <ArrowsHudCard
        arrows={{ state: { ...initialArrowToolState(arrows), active: true, selectedId: "a", ...over }, dispatch }}
        groundAt={groundAt}
      />,
    );
    return dispatch;
  };

  it("dispatches Flatten and Smooth with the ground", () => {
    const ground = () => 4;
    const dispatch = mount({}, ground);
    fireEvent.click(screen.getByRole("button", { name: "Flatten" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "flatten", groundAt: ground });
    fireEvent.click(screen.getByRole("button", { name: "Smooth" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "smooth", groundAt: ground });
  });

  it("falls back to a flat ground when none is passed", () => {
    const dispatch = mount();
    fireEvent.click(screen.getByRole("button", { name: "Flatten" }));
    const action = dispatch.mock.calls[0]![0] as { groundAt: (east: number, north: number) => number };
    expect(action.groundAt(10, 10)).toBe(0);
  });

  it("disables Flatten and Smooth with no arrow selected", () => {
    mount({ selectedId: null });
    expect((screen.getByRole("button", { name: "Flatten" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Smooth" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Undo only when there is history and dispatches undo", () => {
    mount();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const dispatch = mount({ past: [[]] });
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    expect(dispatch).toHaveBeenCalledWith({ type: "undo" });
  });

  it("describes whole-arrow and node editing in the hint", () => {
    mount();
    expect(screen.getByText(/click a node to edit it/i)).toBeTruthy();
    cleanup();
    mount({ selectedPoint: 1 });
    expect(screen.getByText(/Node selected/)).toBeTruthy();
  });
});
