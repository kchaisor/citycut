// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getColour, resetStoredColours } from "../lib/colours";
import { ModelPage } from "./ModelPage";
import type { CityModel, Pt } from "../types";

vi.mock("./Scene3D", () => ({
  Scene3D: () => <div data-testid="scene-3d" />,
}));
vi.mock("./DrawingPlan", () => ({
  DrawingPlan: () => <div data-testid="drawing-plan" />,
}));
vi.mock("./DrawingExplodedAxo", () => ({
  DrawingExplodedAxo: () => <div data-testid="drawing-exploded-axo" />,
}));
vi.mock("./SatellitePane", () => ({
  SatellitePane: () => <div data-testid="satellite-pane" />,
}));

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function roadsModel(): CityModel {
  return {
    placeLabel: "Toorak",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: square(-10, -10, 10, 10),
        holes: [],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
    ],
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
      {
        id: 2,
        kind: "road",
        grade: "path",
        width: 2,
        line: [
          [-20, -20],
          [20, -20],
        ],
      },
    ],
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("Roads and Footpaths colour chips in Primary view", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStoredColours();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the Primary view and writes the primary tokens when Roads and Footpaths colours change", async () => {
    const user = userEvent.setup();
    render(
      <ModelPage model={roadsModel()} onHome={vi.fn()} onNewCut={vi.fn()} />,
    );
    const viewModesSection = screen.getByRole("region", { name: "View modes" });
    const layersSection = screen.getByRole("region", { name: "Layers" });
    const primaryViewCheckbox = within(viewModesSection).getByLabelText(
      "Primary view",
    ) as HTMLInputElement;
    const hex = (six: string) => `${String.fromCharCode(35)}${six}`;
    const defaultRoad = getColour("--primary-road").toLowerCase();
    const defaultFootpath = getColour("--primary-footpath").toLowerCase();
    const surface = getColour("--primary-surface").toLowerCase();
    expect(primaryViewCheckbox.checked).toBe(true);

    fireEvent.change(within(layersSection).getByLabelText("Roads colour"), {
      target: { value: hex("556677") },
    });
    expect(getColour("--primary-road").toLowerCase()).toBe(hex("556677"));
    expect(getColour("--road-local").toLowerCase()).toBe(hex("556677"));
    expect(getColour("--primary-surface").toLowerCase()).toBe(surface);
    expect(
      (
        within(layersSection).getByLabelText("Roads colour") as HTMLInputElement
      ).value.toLowerCase(),
    ).toBe(hex("556677"));
    expect(primaryViewCheckbox.checked).toBe(true);

    fireEvent.change(within(layersSection).getByLabelText("Footpaths colour"), {
      target: { value: hex("778899") },
    });
    expect(getColour("--primary-footpath").toLowerCase()).toBe(hex("778899"));
    expect(getColour("--road-path").toLowerCase()).toBe(hex("778899"));
    expect(getColour("--primary-surface").toLowerCase()).toBe(surface);
    expect(
      (
        within(layersSection).getByLabelText(
          "Footpaths colour",
        ) as HTMLInputElement
      ).value.toLowerCase(),
    ).toBe(hex("778899"));
    expect(primaryViewCheckbox.checked).toBe(true);

    await user.click(
      within(layersSection).getByRole("button", { name: "Reset colours" }),
    );
    expect(getColour("--primary-road").toLowerCase()).toBe(defaultRoad);
    expect(getColour("--primary-footpath").toLowerCase()).toBe(defaultFootpath);
  });
});
