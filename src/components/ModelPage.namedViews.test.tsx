// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelPage } from "./ModelPage";
import type { CityModel, Pt } from "../types";

vi.mock("./Scene3D", () => ({ Scene3D: () => <div data-testid="scene-3d" /> }));
vi.mock("./DrawingPlan", () => ({ DrawingPlan: () => <div data-testid="drawing-plan" /> }));
vi.mock("./DrawingExplodedAxo", () => ({ DrawingExplodedAxo: () => <div data-testid="drawing-exploded-axo" /> }));
vi.mock("./SatellitePane", () => ({ SatellitePane: () => <div data-testid="satellite-pane" /> }));

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function sampleModel(): CityModel {
  return {
    placeLabel: "Toorak",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [{ id: 1, ring: square(-10, -10, 10, 10), holes: [], height: 12, use: "residential", source: "osm_tag" }],
    roads: [
      {
        id: 1,
        kind: "road",
        grade: "local",
        width: 8,
        line: [
          [-40, 0],
          [40, 0],
        ],
      },
    ],
    areas: [{ id: 1, kind: "green", ring: square(-30, -30, -15, -15), holes: [] }],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("Named views in ModelPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the Views panel from the left rail, saves a named view, and lists it again after a reload", async () => {
    const user = userEvent.setup();
    const model = sampleModel();
    const first = render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    await user.click(within(leftRail).getByRole("button", { name: "Views" }));
    expect(within(leftRail).getByRole("button", { name: "Views" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-named-views-count]")?.getAttribute("data-named-views-count")).toBe("0");
    await user.type(screen.getByRole("textbox", { name: "View name" }), "Corner view");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: /^Corner view/ })).toBeTruthy();
    expect(document.querySelector("[data-named-views-count]")?.getAttribute("data-named-views-count")).toBe("1");
    first.unmount();

    render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Corner view/, hidden: true })).toBeTruthy();
  });
});
