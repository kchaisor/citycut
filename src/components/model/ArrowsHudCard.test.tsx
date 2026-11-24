// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrowAnimationPaused, setArrowAnimationPaused } from "../../lib/diagramArrowsMotion";
import { initialArrowToolState } from "../../lib/diagramArrowsTool";
import { ArrowsHudCard } from "./ArrowsHudCard";

afterEach(() => {
  cleanup();
  setArrowAnimationPaused(false);
});

describe("ArrowsHudCard", () => {
  it("lists the five styles in a named group and patches the style", () => {
    const dispatch = vi.fn();
    render(<ArrowsHudCard arrows={{ state: { ...initialArrowToolState(), active: true }, dispatch }} />);
    const group = screen.getByRole("group", { name: "Arrow style" });
    for (const name of ["Streak", "Bold", "Line", "Dashed", "Double"]) {
      expect(within(group).getByRole("button", { name })).toBeTruthy();
    }
    fireEvent.click(within(group).getByRole("button", { name: "Dashed" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "patch", patch: { style: "dashed" } });
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
