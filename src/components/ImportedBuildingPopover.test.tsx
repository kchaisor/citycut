// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportedBuildingPopover } from "./BuildingHeightPopover";
import { qaSchemeMassing } from "../lib/qaSchemeFixture";

afterEach(cleanup);

const massing = qaSchemeMassing(0);
const byName = (name: string) => massing.buildings.find((building) => building.name === name)!;

function setup(name: string, overrides = {}) {
  const onSetUse = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ImportedBuildingPopover
      building={{ ...byName(name), ...overrides }}
      fileName={massing.name}
      onSetUse={onSetUse}
      onClose={onClose}
      floatingScreen={{ left: 600, top: 200 }}
    />,
  );
  return { ...view, onSetUse, onClose };
}

function row(container: HTMLElement, label: string) {
  return [...container.querySelectorAll(".imported-popover-row")].find(
    (element) => element.querySelector(".imported-popover-label")?.textContent === label,
  );
}

describe("imported building popover", () => {
  it("shows Not set with a Set use select that sets the use", () => {
    const { container, onSetUse } = setup("Podium");
    expect(container.querySelector(".imported-popover-title")?.textContent).toBe("Podium");
    const use = row(container, "Use")!.querySelector(".imported-popover-value")!;
    expect(use.textContent).toBe("Not set");
    expect(use.classList.contains("is-empty")).toBe(true);
    fireEvent.change(screen.getByLabelText("Set use"), { target: { value: "retail" } });
    expect(onSetUse).toHaveBeenCalledWith("retail");
  });

  it("shows height in metres and levels as — Not in model when the file has none", () => {
    const { container } = setup("Podium");
    expect(row(container, "Height")!.querySelector(".imported-popover-value")?.textContent).toBe("18 m");
    expect(row(container, "Levels")!.querySelector(".imported-popover-value")?.textContent).toBe("—");
    expect(container.textContent).toContain("Not in model");
  });

  it("shows levels from user text and the use when set", () => {
    const { container } = setup("Tower B");
    expect(row(container, "Use")!.querySelector(".imported-popover-value")?.textContent).toBe("Commercial");
    expect(row(container, "Levels")!.querySelector(".imported-popover-value")?.textContent).toBe("12");
    expect(container.textContent).not.toContain("Not in model");
  });

  it("hides the Layer row when the layer leaf equals the name, and shows it when it differs", () => {
    expect(row(setup("Podium").container, "Layer")).toBeUndefined();
    cleanup();
    const renamed = setup("Tower B", { name: "Tower B East" });
    expect(row(renamed.container, "Layer")!.querySelector(".imported-popover-value")?.textContent).toBe(
      "Scheme A › Tower B",
    );
  });

  it("names the source file and has no map-building rows", () => {
    const { container, onClose } = setup("Tower A");
    expect(container.querySelector(".imported-popover-source")?.textContent).toBe(
      "Source: your model (rhino-three-buildings.3dm)",
    );
    for (const label of ["Lot", "Zone", "Year built", "Height (m)", "Footprint"]) {
      expect(container.textContent).not.toContain(label);
    }
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
