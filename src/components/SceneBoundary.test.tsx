// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SceneBoundary } from "./SceneBoundary";

function Boom(): null {
  throw new Error("scene boom");
}

function Ok() {
  return <p>scene ok</p>;
}

describe("SceneBoundary", () => {
  it("renders the scene fallback instead of null", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <SceneBoundary>
        <Boom />
      </SceneBoundary>,
    );
    expect(screen.getByText(/3D view could not start/i)).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("clears the fallback when resetKey changes", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <SceneBoundary resetKey="a">
        <Boom />
      </SceneBoundary>,
    );
    expect(screen.getAllByText(/3D view could not start/i).length).toBeGreaterThan(0);
    rerender(
      <SceneBoundary resetKey="b">
        <Ok />
      </SceneBoundary>,
    );
    expect(screen.getByText("scene ok")).toBeTruthy();
    consoleSpy.mockRestore();
  });
});
