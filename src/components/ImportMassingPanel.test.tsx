// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportMassingPanel } from "./ImportMassingPanel";
import { qaSchemeMassing } from "../lib/qaSchemeFixture";
import { parsedFromSnapshot, type ParsedMassingSnapshot } from "../lib/qaSchemeFixture";
import snapshot from "../lib/__fixtures__/rhino-three-buildings.parsed.json";
import { importedMassingFromStored } from "../lib/massingStore";
import { LEGACY_SINGLE_BUILDING_NOTE, schemeHeading } from "../lib/massingBuildings";
import type { ImportedMassing } from "../lib/massingImport";

afterEach(cleanup);

const origin = { lon: 144.9645, lat: -37.8216 };

function setup(imported: ImportedMassing[], selected: { fileId: string; buildingId: string } | null = null) {
  const handlers = {
    onImport: vi.fn(),
    onMode: vi.fn(),
    onPlacement: vi.fn(),
    onSnap: vi.fn(),
    onResetMga: vi.fn(),
    onToggleVisible: vi.fn(),
    onAllVisible: vi.fn(),
    onBuildingsVisible: vi.fn(),
    onSelectBuilding: vi.fn(),
    onColour: vi.fn(),
    onRemove: vi.fn(),
  };
  const view = render(
    <ImportMassingPanel
      imported={imported}
      warnings={new Map()}
      crsName="MGA 2020 zone 55"
      placingId={null}
      busy={false}
      error={null}
      selected={selected}
      {...handlers}
    />,
  );
  return { ...view, handlers };
}

function rows(container: HTMLElement) {
  return [...container.querySelectorAll(".massing-building-row")] as HTMLElement[];
}

describe("Import panel buildings", () => {
  it("groups buildings under a scheme heading with a count and short names", () => {
    const { container } = setup([qaSchemeMassing(origin, 55, 0)]);
    expect(container.querySelector(".massing-scheme-title")?.textContent).toBe("Scheme A · 3");
    expect(rows(container).map((row) => row.querySelector(".massing-building-name")?.textContent)).toEqual([
      "Tower A Residential",
      "Podium",
      "Tower B",
    ]);
    expect(container.textContent).toContain("3 buildings from layers and user text");
    expect(container.textContent).toContain("1 model");
  });

  it("shows the last two segments of a deep parent, joined with › and truncated in the middle", () => {
    expect(schemeHeading("Site::Scheme A::Stage 1")).toBe("Scheme A › Stage 1");
    const long = schemeHeading("Site::A very long scheme name indeed::Stage one of three");
    expect(long).toHaveLength(28);
    expect(long).toContain("…");
    const massing = qaSchemeMassing(origin, 55, 0);
    const deep = {
      ...massing,
      buildings: massing.buildings.map((building) => ({ ...building, scheme: "Site::Scheme A::Stage 1" })),
    };
    const { container } = setup([deep]);
    expect(container.querySelector(".massing-scheme-title")?.textContent).toBe("Scheme A › Stage 1 · 3");
  });

  it("marks unclassified with a hatch swatch and omits levels when absent", () => {
    const { container } = setup([qaSchemeMassing(origin, 55, 0)]);
    const [towerA, podium, towerB] = rows(container);
    expect(podium!.querySelector(".massing-swatch")?.classList.contains("is-unclassified")).toBe(true);
    expect(podium!.querySelector(".massing-building-meta")?.textContent).toBe("Unclassified · 9 m");
    expect(towerA!.querySelector(".massing-swatch")?.classList.contains("is-unclassified")).toBe(false);
    expect(towerA!.querySelector(".massing-building-meta")?.textContent).toBe("Residential · 45 m");
    expect(towerB!.querySelector(".massing-building-meta")?.textContent).toBe("Commercial · 38 m · 12 levels");
  });

  it("toggles a row, a scheme and the model with their eyes", () => {
    const massing = qaSchemeMassing(origin, 55, 0);
    const { container, handlers } = setup([massing]);
    fireEvent.click(within(rows(container)[1]!).getByRole("button", { name: "Hide Podium" }));
    expect(handlers.onBuildingsVisible).toHaveBeenLastCalledWith("qa-scheme", ["layer:Scheme A::Podium"], false);
    fireEvent.click(screen.getByRole("button", { name: "Hide every building in Scheme A" }));
    expect(handlers.onBuildingsVisible).toHaveBeenLastCalledWith(
      "qa-scheme",
      massing.buildings.map((building) => building.id),
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide model" }));
    expect(handlers.onAllVisible).toHaveBeenCalledWith(false);
    expect(handlers.onSelectBuilding).not.toHaveBeenCalled();
  });

  it("shows a hidden building with an eye-off and selects a row on click", () => {
    const massing = qaSchemeMassing(origin, 55, 0);
    const hidden = {
      ...massing,
      buildings: massing.buildings.map((building) => (building.name === "Tower B" ? { ...building, visible: false } : building)),
    };
    const { container, handlers } = setup([hidden], { fileId: "qa-scheme", buildingId: "layer:Scheme A::Podium" });
    const [, podium, towerB] = rows(container);
    expect(towerB!.classList.contains("is-hidden")).toBe(true);
    expect(within(towerB!).getByRole("button", { name: "Show Tower B" }).getAttribute("aria-pressed")).toBe("false");
    expect(podium!.classList.contains("is-selected")).toBe(true);
    fireEvent.click(podium!.querySelector(".massing-building-main")!);
    expect(handlers.onSelectBuilding).toHaveBeenCalledWith("qa-scheme", "layer:Scheme A::Podium", expect.any(Number), expect.any(Number));
  });

  it("switches colour mode: Single colour sets the file colour, By use clears it", () => {
    const massing = qaSchemeMassing(origin, 55, 0);
    const byUse = setup([massing]);
    expect(byUse.container.querySelector('input[type="color"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Single colour" }));
    expect(byUse.handlers.onColour).toHaveBeenCalledWith("qa-scheme", expect.stringMatching(/^#[0-9A-F]{6}$/i));
    cleanup();
    const single = setup([{ ...massing, colour: "#3366CC" }]);
    expect(single.container.querySelector('input[type="color"]')).not.toBeNull();
    single.container.querySelectorAll(".massing-swatch").forEach((swatch) => {
      expect(swatch.classList.contains("is-unclassified")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "By use" }));
    expect(single.handlers.onColour).toHaveBeenCalledWith("qa-scheme", null);
  });

  it("collapses placement into one summary line and keeps today's controls inside", () => {
    const { container } = setup([qaSchemeMassing(origin, 55, 0)]);
    const summary = container.querySelector(".massing-placement-summary")!;
    expect(summary.textContent).toMatch(/^Placed · E \d+\.\d\d · N \d+\.\d\d$/);
    expect(container.querySelector(".massing-file-meta")?.textContent).toBe("11 KB · 42 triangles");
    expect(screen.queryByText("Snap base to ground")).toBeNull();
    fireEvent.click(summary);
    expect(screen.getByText("Snap base to ground")).toBeTruthy();
    expect(screen.getByLabelText("Rotation (°)")).toBeTruthy();
  });

  it("asks before removing a model", () => {
    const { handlers } = setup([qaSchemeMassing(origin, 55, 0)]);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(handlers.onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(handlers.onRemove).toHaveBeenCalledWith("qa-scheme");
  });

  it("loads a legacy saved model as one building with the import-again note", () => {
    const parsed = parsedFromSnapshot(snapshot as ParsedMassingSnapshot);
    const legacy = importedMassingFromStored(parsed, {
      id: "legacy",
      name: "rhino-three-buildings.3dm",
      bytes: new ArrayBuffer(10),
      mode: "click",
      placement: { e: 0, n: 0, base: 0, rotDeg: 0 },
      visible: true,
    });
    const { container } = setup([legacy]);
    expect(rows(container)).toHaveLength(1);
    expect(container.querySelector(".massing-scheme-title")).toBeNull();
    expect(container.querySelector(".massing-building-name")?.textContent).toBe("rhino-three-buildings");
    expect(container.textContent).toContain(LEGACY_SINGLE_BUILDING_NOTE);
  });
});
