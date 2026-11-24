// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialArrowToolState } from "../../lib/diagramArrowsTool";
import { ArrowsHudCard } from "./ArrowsHudCard";

afterEach(cleanup);

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

  it("shows the animation placeholder note and a Done button", () => {
    const dispatch = vi.fn();
    render(<ArrowsHudCard arrows={{ state: { ...initialArrowToolState(), active: true }, dispatch }} />);
    expect(screen.getByText("Animation preview comes next")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setActive", active: false });
  });
});
