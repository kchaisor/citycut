// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppFatalBoundary } from "./AppFatalBoundary";

afterEach(() => cleanup());

function Boom(): null {
  throw new Error("test boom");
}

describe("AppFatalBoundary", () => {
  it("shows a fallback with the error text instead of an empty document", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppFatalBoundary onBackToMap={() => undefined}>
        <Boom />
      </AppFatalBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/test boom/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reload/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back to map/i })).toBeTruthy();
    expect(document.body.textContent?.length).toBeGreaterThan(20);
    consoleSpy.mockRestore();
  });

  it("calls onBackToMap when Back to map is pressed", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <AppFatalBoundary onBackToMap={onBack}>
        <Boom />
      </AppFatalBoundary>,
    );
    await user.click(screen.getByRole("button", { name: "Back to map" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
