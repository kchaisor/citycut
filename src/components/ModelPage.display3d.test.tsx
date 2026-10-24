// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uniformBuildingColor } from "../lib/buildingUse";
import { getColour, resetStoredColours } from "../lib/colours";
import { ROAD_COLOR } from "../lib/surfaceLayers";
import { terrainTint } from "../lib/terrain";
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

function sampleModel(opts?: {
  withWater?: boolean;
  withTrees?: boolean;
  withFootpaths?: boolean;
  withRail?: boolean;
  withBlocks?: boolean;
}): CityModel {
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
      {
        id: 2,
        ring: square(20, 20, 40, 40),
        holes: [],
        height: 18,
        use: "commercial",
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
      ...(opts?.withFootpaths
        ? [
            {
              id: 2,
              kind: "road" as const,
              grade: "path" as const,
              width: 2,
              line: [
                [-20, -20],
                [20, -20],
              ] as Pt[],
            },
          ]
        : []),
      ...(opts?.withRail
        ? [
            {
              id: 3,
              kind: "rail" as const,
              grade: "local" as const,
              width: 4,
              line: [
                [-50, 10],
                [50, 10],
              ] as Pt[],
            },
          ]
        : []),
    ],
    areas: [
      {
        id: 1,
        kind: "green",
        ring: square(-30, -30, -15, -15),
        holes: [],
      },
      ...(opts?.withWater
        ? [
            {
              id: 2,
              kind: "water" as const,
              ring: square(15, -30, 30, -15),
              holes: [],
            },
          ]
        : []),
    ],
    trees: opts?.withTrees
      ? [
          {
            id: 1,
            at: [5, 5],
            height_m: 9,
            crown_diameter_m: 6,
            trunk_diameter_m: 0.4,
            sizeSource: "osm",
          },
        ]
      : [],
    blocks: opts?.withBlocks
      ? [
          {
            id: 10,
            kind: "block",
            ring: square(-45, -45, -35, -35),
            holes: [],
          },
        ]
      : undefined,
    roadKm: 0.1,
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

  it("shows 3D projection, 3D display switches, and only available 3D layers (without Building types or counts) under 3D model, and hides 2D drawing controls until Drawing is selected", async () => {
    const user = userEvent.setup();
    render(
      <ModelPage
        model={sampleModel({ withWater: false, withTrees: false })}
        onHome={vi.fn()}
        onNewCut={vi.fn()}
      />,
    );

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
    expect(freeRotate.compareDocumentPosition(displayGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Building types is NOT shown in Display › 3D model
    expect(screen.queryByRole("region", { name: "Building types" })).toBeNull();
    expect(screen.queryByText("Building types")).toBeNull();

    // 3D layers section sits underneath 3D display switches and shows ONLY available layers without counts
    const layersSection = screen.getByRole("region", { name: "3D layers" });
    expect(displayGroup.compareDocumentPosition(layersSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(layersSection).getByText("Buildings")).toBeTruthy();
    expect(within(layersSection).getByText("Roads")).toBeTruthy();
    expect(within(layersSection).getByText("Landscape")).toBeTruthy();
    expect(within(layersSection).getByText("Contours")).toBeTruthy();
    expect(within(layersSection).getByText("Ground")).toBeTruthy();
    // Unavailable layers in this model are omitted
    expect(within(layersSection).queryByText("Water")).toBeNull();
    expect(within(layersSection).queryByText("Trees")).toBeNull();
    expect(within(layersSection).queryByText("Footpaths")).toBeNull();
    expect(within(layersSection).queryByText("Rail & tram")).toBeNull();
    expect(within(layersSection).queryByText("Blocks")).toBeNull();
    // No counts rendered in the 3D layers section
    expect(layersSection.querySelectorAll("b").length).toBe(0);

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
    expect(screen.queryByRole("region", { name: "3D layers" })).toBeNull();
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
    expect(screen.queryByRole("region", { name: "3D layers" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Plan scale" })).toBeNull();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.getByText(/Satellite is a preview of this frame/)).toBeTruthy();
  });

  it("renders Water, Trees, Footpaths, Rail & tram, and Blocks when present in model and updates live 3D layer colours on pick", async () => {
    const user = userEvent.setup();
    render(
      <ModelPage
        model={sampleModel({
          withWater: true,
          withTrees: true,
          withFootpaths: true,
          withRail: true,
          withBlocks: true,
        })}
        onHome={vi.fn()}
        onNewCut={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Display" }));
    const layersSection = screen.getByRole("region", { name: "3D layers" });
    expect(within(layersSection).getByText("Buildings")).toBeTruthy();
    expect(within(layersSection).getByText("Roads")).toBeTruthy();
    expect(within(layersSection).getByText("Footpaths")).toBeTruthy();
    expect(within(layersSection).getByText("Trees")).toBeTruthy();
    expect(within(layersSection).getByText("Landscape")).toBeTruthy();
    expect(within(layersSection).getByText("Water")).toBeTruthy();
    expect(within(layersSection).getByText("Blocks")).toBeTruthy();
    expect(within(layersSection).getByText("Rail & tram")).toBeTruthy();
    expect(within(layersSection).getByText("Contours")).toBeTruthy();
    expect(within(layersSection).getByText("Ground")).toBeTruthy();
    expect(layersSection.querySelectorAll("b").length).toBe(0);

    const hex = (six: string) => `${String.fromCharCode(35)}${six}`;

    // Turn on White card and Hide trees first to verify layer colour picks reveal the layer
    const whiteCardCheckbox = screen.getByLabelText("White card") as HTMLInputElement;
    const hideTreesCheckbox = screen.getByLabelText("Hide trees") as HTMLInputElement;
    const contoursCheckbox = screen.getByLabelText("Contours in 3D") as HTMLInputElement;
    await user.click(whiteCardCheckbox);
    await user.click(hideTreesCheckbox);
    expect(whiteCardCheckbox.checked).toBe(true);
    expect(hideTreesCheckbox.checked).toBe(true);
    expect(contoursCheckbox.checked).toBe(false);

    // Buildings colour
    fireEvent.change(within(layersSection).getByLabelText("Buildings colour"), {
      target: { value: hex("d48855") },
    });
    expect(getColour("--building-uniform").toLowerCase()).toBe(hex("d48855"));
    expect(uniformBuildingColor().toLowerCase()).toBe(hex("d48855"));
    expect(whiteCardCheckbox.checked).toBe(false);

    // Roads colour
    fireEvent.change(within(layersSection).getByLabelText("Roads colour"), {
      target: { value: hex("556677") },
    });
    expect(getColour("--road-local").toLowerCase()).toBe(hex("556677"));
    expect(ROAD_COLOR.local.toLowerCase()).toBe(hex("556677"));
    expect(ROAD_COLOR.arterial.toLowerCase()).toBe(hex("556677"));

    // Trees colour (also unchecks Hide trees)
    fireEvent.change(within(layersSection).getByLabelText("Trees colour"), {
      target: { value: hex("2d7a47") },
    });
    expect(getColour("--tree-crown").toLowerCase()).toBe(hex("2d7a47"));
    expect(hideTreesCheckbox.checked).toBe(false);

    // Landscape colour
    fireEvent.change(within(layersSection).getByLabelText("Landscape colour"), {
      target: { value: hex("6ea864") },
    });
    expect(getColour("--green-3d").toLowerCase()).toBe(hex("6ea864"));

    // Water colour
    fireEvent.change(within(layersSection).getByLabelText("Water colour"), {
      target: { value: hex("2277bb") },
    });
    expect(getColour("--water-3d").toLowerCase()).toBe(hex("2277bb"));

    // Contours colour (also enables Contours in 3D)
    fireEvent.change(within(layersSection).getByLabelText("Contours colour"), {
      target: { value: hex("aa5522") },
    });
    expect(getColour("--outline-contour").toLowerCase()).toBe(hex("aa5522"));
    expect(contoursCheckbox.checked).toBe(true);

    // Ground colour (updates both flat ground and 3D terrain tint)
    fireEvent.change(within(layersSection).getByLabelText("Ground colour"), {
      target: { value: hex("c2b280") },
    });
    expect(getColour("--ground-fill").toLowerCase()).toBe(hex("c2b280"));
    const [r, g, b] = terrainTint({ min: 0, max: 10 }, 10);
    expect(r).toBeCloseTo(0xc2 / 255, 2);
    expect(g).toBeCloseTo(0xb2 / 255, 2);
    expect(b).toBeCloseTo(0x80 / 255, 2);
  });
});
