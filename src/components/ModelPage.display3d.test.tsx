// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILDING_USE_META } from "../lib/buildingUse";
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

function sampleModel(withBuildings: boolean): CityModel {
  return {
    placeLabel: "Toorak",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 1000,
    layers: { buildings: withBuildings, roads: true, waterGreen: true, trees: true },
    buildings: withBuildings
      ? [
          {
            id: 1,
            ring: square(-10, -10, 10, 10),
            holes: [],
            height: 12,
            use: "residential",
            source: "osm_tag",
          },
          {
            id: 2,
            ring: square(20, 20, 40, 40),
            holes: [],
            height: 18,
            use: "commercial",
            source: "osm_tag",
          },
        ]
      : [],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
    contourLayer: {
      source: "vicmap-metro",
      label: "Vicmap Elevation 1 m",
      interval: 1,
      attribution: null,
      datasetUrl: null,
      featureCount: 5,
      fetchMs: 12,
      lines: [
        {
          z: 20,
          points: [
            [-50, -50],
            [50, 50],
          ],
        },
      ],
    },
  };
}

describe("Display panel controls by view tab", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStoredColours();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows 3D projection, 3D display switches, and adjustable Building types colours under 3D model, and hides 2D drawing controls until Drawing is selected", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel(true)} onHome={vi.fn()} onNewCut={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Display" }));

    const tab3d = screen.getByRole("tab", { name: "3D model" });
    const tabDrawing = screen.getByRole("tab", { name: "Drawing" });
    const tabSatellite = screen.getByRole("tab", { name: "Satellite" });
    expect(tab3d.getAttribute("aria-selected")).toBe("true");

    // 3D controls are visible when 3D model is active
    expect(screen.getByRole("group", { name: "Projection" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Isometric" }));
    expect(screen.getByRole("group", { name: "Isometric corner" })).toBeTruthy();
    const freeRotate = screen.getByLabelText("Free rotate (axonometric)");
    const displayGroup = screen.getByRole("group", { name: "3D display" });
    expect(displayGroup).toBeTruthy();
    expect(screen.getByLabelText("White card")).toBeTruthy();
    expect(screen.getByLabelText("Outlines")).toBeTruthy();
    expect(screen.getByLabelText("Contours in 3D")).toBeTruthy();
    expect(screen.getByLabelText("Hide trees")).toBeTruthy();
    // 3D display switches sit underneath Free rotate (axonometric)
    expect(freeRotate.compareDocumentPosition(displayGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Building types section sits underneath 3D display switches with adjustable colour inputs
    const buildingTypesSection = screen.getByRole("region", { name: "Building types" });
    expect(displayGroup.compareDocumentPosition(buildingTypesSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(buildingTypesSection).getByText("Residential")).toBeTruthy();
    expect(within(buildingTypesSection).getByText("Commercial")).toBeTruthy();

    const resColourInput = within(buildingTypesSection).getByLabelText("Residential colour") as HTMLInputElement;
    const comColourInput = within(buildingTypesSection).getByLabelText("Commercial colour") as HTMLInputElement;
    expect(resColourInput.type).toBe("color");
    expect(comColourInput.type).toBe("color");

    // Adjusting a building type colour updates the live CSS variable and swatch colour (and clears White card if set)
    const whiteCardCheckbox = screen.getByLabelText("White card") as HTMLInputElement;
    await user.click(whiteCardCheckbox);
    expect(whiteCardCheckbox.checked).toBe(true);

    const nextColour = `${String.fromCharCode(35)}2288cc`;
    fireEvent.change(resColourInput, { target: { value: nextColour } });
    expect(getColour("--use-residential").toLowerCase()).toBe(nextColour);
    expect(BUILDING_USE_META.residential.color.toLowerCase()).toBe(nextColour);
    expect(resColourInput.value.toLowerCase()).toBe(nextColour);
    expect(whiteCardCheckbox.checked).toBe(false);

    // 2D drawing controls must NOT appear when 3D model is selected
    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Site plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Figure-ground" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exploded axo" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Plan scale" })).toBeNull();
    expect(screen.queryByText(/Contours:/)).toBeNull();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit frame" })).toBeNull();

    // Switching to Drawing shows 2D drawing controls and hides 3D controls
    await user.click(tabDrawing);
    expect(tabDrawing.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("group", { name: "Projection" })).toBeNull();
    expect(screen.queryByRole("group", { name: "3D display" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Building types" })).toBeNull();
    expect(screen.getByRole("group", { name: "Drawing type" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Site plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Figure-ground" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exploded axo" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Plan scale" })).toBeTruthy();
    expect(screen.getByText(/Contours:/)).toBeTruthy();
    expect(screen.getByText("Line styles")).toBeTruthy();
    expect(screen.getByText("Colours")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fit frame" })).toBeTruthy();

    // Switching to Satellite hides both 3D and 2D drawing controls
    await user.click(tabSatellite);
    expect(tabSatellite.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("group", { name: "Projection" })).toBeNull();
    expect(screen.queryByRole("group", { name: "3D display" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Building types" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Plan scale" })).toBeNull();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.getByText(/Satellite is a preview of this frame/)).toBeTruthy();
  });
});
