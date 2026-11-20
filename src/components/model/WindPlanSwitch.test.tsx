// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { WindPlanMode } from "../../lib/windPlanField";
import { WindPlanSwitch } from "./WindPlanSwitch";

function Harness() {
  const [mode, setMode] = useState<WindPlanMode>("speed");
  const [vectorsOn, setVectorsOn] = useState(true);
  return (
    <div data-mode={mode} data-vectors={vectorsOn ? "on" : "off"} data-testid="plan">
      <WindPlanSwitch plan={{ mode, setMode, vectorsOn, setVectorsOn }} />
    </div>
  );
}

describe("plan wind switch", () => {
  afterEach(cleanup);

  it("shows arrows by default and hides them when toggled off", () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: "Arrows" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("plan").getAttribute("data-vectors")).toBe("on");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("plan").getAttribute("data-vectors")).toBe("off");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the Wind speed / Comfort switch working beside it", () => {
    render(<Harness />);
    const comfort = screen.getByRole("button", { name: "Comfort" });
    fireEvent.click(comfort);
    expect(comfort.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Wind speed" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("plan").getAttribute("data-mode")).toBe("comfort");
    fireEvent.click(screen.getByRole("button", { name: "Arrows" }));
    expect(screen.getByTestId("plan").getAttribute("data-mode")).toBe("comfort");
    expect(screen.getByTestId("plan").getAttribute("data-vectors")).toBe("off");
  });
});
