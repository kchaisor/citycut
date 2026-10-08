// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SceneBoundary } from "./SceneBoundary";

function Boom(): null {
  throw new Error("scene boom");
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
});
