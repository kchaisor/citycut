// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getColour, resetStoredColours } from "../lib/colours";
import { ROAD_COLOR } from "../lib/surfaceLayers";
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

  it("opens on the Display tab by default, splits left and right horizontal top icon rails, and renders View modes -> Projection -> Layers -> Colors in order", async () => {
    const user = userEvent.setup();
    render(
      <ModelPage
        model={sampleModel({ withWater: false, withTrees: false })}
        onHome={vi.fn()}
        onNewCut={vi.fn()}
      />,
    );

    // Left and right top horizontal icon rails
    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    const rightRail = screen.getByRole("toolbar", { name: "Model info" });
    expect(leftRail.getAttribute("aria-orientation")).toBe("horizontal");
    expect(rightRail.getAttribute("aria-orientation")).toBe("horizontal");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    const siteAnalysisBtn = within(leftRail).getByRole("button", { name: "Site Analysis" });
    expect(siteAnalysisBtn.querySelector("svg.lucide-radar")).toBeTruthy();
    const analysisTabs = document.querySelector(".site-analysis-tabs") as HTMLElement;
    expect(within(analysisTabs).getByRole("tab", { name: "Sun", hidden: true }).querySelector("svg.lucide-sun")).toBeTruthy();
    expect(within(leftRail).getByRole("button", { name: "Site Analysis" })).toBeTruthy();
    expect(within(leftRail).getByRole("button", { name: "Import" })).toBeTruthy();
    expect(within(leftRail).queryByRole("button", { name: "Export" })).toBeNull();
    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(rightRail).getByRole("button", { name: "Trees" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: /Export model/i })).toBeNull();

    // Display tab is already open by default on 3D model
    const tab3d = screen.getByRole("tab", { name: "3D model" });
    const tabDrawing = screen.getByRole("tab", { name: "Drawing" });
    const tabSatellite = screen.getByRole("tab", { name: "Satellite" });
    expect(tab3d.getAttribute("aria-selected")).toBe("true");

    // 3 sections in Display › 3D model in order: View modes -> Projection -> Layers (with inline colour swatches)
    const viewModesSection = screen.getByRole("region", { name: "View modes" });
    const projectionSection = screen.getByRole("region", { name: "Projection" });
    const layersSection = screen.getByRole("region", { name: "Layers" });
    expect(screen.queryByRole("region", { name: "Colors" })).toBeNull();

    expect(viewModesSection.compareDocumentPosition(projectionSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(projectionSection.compareDocumentPosition(layersSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // View modes contains White card and Outlines
    expect(within(viewModesSection).getByLabelText("White card")).toBeTruthy();
    expect(within(viewModesSection).getByLabelText("Outlines")).toBeTruthy();

    // Projection contains Perspective, Isometric, Plan, and Isometric corner / Free rotate when Isometric is active
    expect(within(projectionSection).getByRole("group", { name: "Projection" })).toBeTruthy();
    await user.click(within(projectionSection).getByRole("button", { name: "Isometric" }));
    expect(within(projectionSection).getByRole("group", { name: "Isometric corner" })).toBeTruthy();
    const freeRotate = within(projectionSection).getByLabelText("Free rotate (axonometric)");
    expect(freeRotate.compareDocumentPosition(layersSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Viewport hint overlay ("Drag to orbit..." / "Drag to pan...") is not rendered
    expect(document.querySelector(".viewport-hint")).toBeNull();
    expect(screen.queryByText(/Drag to orbit/)).toBeNull();
    expect(screen.queryByText(/Drag to pan/)).toBeNull();

    // Building types is NOT shown in Display › 3D model
    expect(screen.queryByRole("region", { name: "Building types" })).toBeNull();
    expect(screen.queryByText("Building types")).toBeNull();

    // Layers section omits Ground/single Buildings row and shows present building uses + available scene layers, all ON by default
    for (const label of ["Residential", "Commercial", "Roads", "Landscape", "Contours"]) {
      const cb = within(layersSection).getByLabelText(label) as HTMLInputElement;
      expect(cb.checked).toBe(true);
    }
    expect(within(layersSection).queryByLabelText("Buildings")).toBeNull();
    expect(within(layersSection).queryByLabelText("Ground")).toBeNull();
    expect(within(layersSection).queryByLabelText("Water")).toBeNull();
    expect(within(layersSection).queryByLabelText("Trees")).toBeNull();
    expect(within(layersSection).queryByLabelText("Footpaths")).toBeNull();
    expect(within(layersSection).queryByLabelText("Rail & tram")).toBeNull();
    expect(within(layersSection).queryByLabelText("Blocks")).toBeNull();

    // Inline colour swatches sit inside each Scene Layers row, omitting unavailable layers
    expect(within(layersSection).getByLabelText("Residential colour")).toBeTruthy();
    expect(within(layersSection).getByLabelText("Commercial colour")).toBeTruthy();
    expect(within(layersSection).getByLabelText("Roads colour")).toBeTruthy();
    expect(within(layersSection).getByLabelText("Landscape colour")).toBeTruthy();
    expect(within(layersSection).getByLabelText("Contours colour")).toBeTruthy();
    expect(within(layersSection).queryByLabelText("Ground colour")).toBeNull();
    expect(within(layersSection).queryByLabelText("Water colour")).toBeNull();
    expect(within(layersSection).queryByLabelText("Trees colour")).toBeNull();
    expect(within(layersSection).queryByLabelText("Footpaths colour")).toBeNull();
    expect(within(layersSection).queryByLabelText("Rail & tram colour")).toBeNull();
    expect(within(layersSection).queryByLabelText("Blocks colour")).toBeNull();

    // 2D drawing controls must NOT appear when 3D model is selected
    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Plan scale" })).toBeNull();
    expect(screen.queryByText(/Contours:/)).toBeNull();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit frame" })).toBeNull();

    // Switching to Drawing shows the unified Studio HUD outliner (View Style + Plan scale + Scene Layers) with no duplicate Drawing type switcher or Line styles
    await user.click(tabDrawing);
    expect(tabDrawing.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "View modes" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Projection" })).toBeNull();
    const drawingLayersSection = screen.getByRole("region", { name: "Layers" });
    expect(drawingLayersSection).toBeTruthy();
    expect(within(drawingLayersSection).getByLabelText("Residential")).toBeTruthy();
    expect(within(drawingLayersSection).getByLabelText("Commercial")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Colors" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.getByRole("button", { name: "Quick Site plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quick Figure-ground" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quick Exploded axo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quick Isometric" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Plan scale" })).toBeTruthy();
    expect(screen.getByText(/Contours:/)).toBeTruthy();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit frame" })).toBeNull();

    // Switching to Satellite hides both 3D and 2D drawing controls
    await user.click(tabSatellite);
    expect(tabSatellite.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "View modes" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Projection" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Layers" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Colors" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Plan scale" })).toBeNull();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.getByText(/Satellite is a preview of this frame/)).toBeTruthy();
  });

  it("renders Water, Trees, Footpaths, and Rail & tram in Layers and Colors when present, omits Ground and Blocks, defaults all layers ON, and updates live 3D layer colours on pick", async () => {
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

    const viewModesSection = screen.getByRole("region", { name: "View modes" });
    const layersSection = screen.getByRole("region", { name: "Layers" });
    const colorsSection = layersSection;
    expect(screen.queryByRole("region", { name: "Colors" })).toBeNull();

    for (const label of [
      "Residential",
      "Commercial",
      "Roads",
      "Footpaths",
      "Trees",
      "Landscape",
      "Water",
      "Rail & tram",
      "Contours",
    ]) {
      const layerToggle = within(layersSection).getByLabelText(label) as HTMLInputElement;
      expect(layerToggle.checked).toBe(true);
      expect(within(layersSection).getByLabelText(`${label} colour`)).toBeTruthy();
    }
    expect(within(layersSection).queryByLabelText("Buildings")).toBeNull();
    expect(within(layersSection).queryByLabelText("Ground")).toBeNull();
    expect(within(layersSection).queryByLabelText("Ground colour")).toBeNull();
    expect(within(layersSection).queryByLabelText("Blocks")).toBeNull();
    expect(within(layersSection).queryByLabelText("Blocks colour")).toBeNull();

    const hex = (six: string) => `${String.fromCharCode(35)}${six}`;

    // Turn on White card and turn off Trees and Contours first to verify layer colour picks re-enable the layer
    const whiteCardCheckbox = within(viewModesSection).getByLabelText("White card") as HTMLInputElement;
    const treesCheckbox = within(layersSection).getByLabelText("Trees") as HTMLInputElement;
    const contoursCheckbox = within(layersSection).getByLabelText("Contours") as HTMLInputElement;
    await user.click(whiteCardCheckbox);
    await user.click(treesCheckbox);
    await user.click(contoursCheckbox);
    expect(whiteCardCheckbox.checked).toBe(true);
    expect(treesCheckbox.checked).toBe(false);
    expect(contoursCheckbox.checked).toBe(false);

    const defaultResidential = getColour("--use-residential").toLowerCase();
    const defaultRoadLocal = getColour("--road-local").toLowerCase();
    const defaultTreeCrown = getColour("--tree-crown").toLowerCase();
    const defaultGreen3d = getColour("--green-3d").toLowerCase();
    const defaultWater3d = getColour("--water-3d").toLowerCase();
    const defaultContour = getColour("--outline-contour").toLowerCase();

    // Residential building use colour
    fireEvent.change(within(colorsSection).getByLabelText("Residential colour"), {
      target: { value: hex("d48855") },
    });
    expect(getColour("--use-residential").toLowerCase()).toBe(hex("d48855"));
    expect(whiteCardCheckbox.checked).toBe(false);

    // Roads colour
    fireEvent.change(within(colorsSection).getByLabelText("Roads colour"), {
      target: { value: hex("556677") },
    });
    expect(getColour("--road-local").toLowerCase()).toBe(hex("556677"));
    expect(ROAD_COLOR.local.toLowerCase()).toBe(hex("556677"));
    expect(ROAD_COLOR.arterial.toLowerCase()).toBe(hex("556677"));

    // Trees colour (also re-enables Trees layer)
    fireEvent.change(within(colorsSection).getByLabelText("Trees colour"), {
      target: { value: hex("2d7a47") },
    });
    expect(getColour("--tree-crown").toLowerCase()).toBe(hex("2d7a47"));
    expect(treesCheckbox.checked).toBe(true);

    // Landscape colour
    fireEvent.change(within(colorsSection).getByLabelText("Landscape colour"), {
      target: { value: hex("6ea864") },
    });
    expect(getColour("--green-3d").toLowerCase()).toBe(hex("6ea864"));

    // Water colour
    fireEvent.change(within(colorsSection).getByLabelText("Water colour"), {
      target: { value: hex("2277bb") },
    });
    expect(getColour("--water-3d").toLowerCase()).toBe(hex("2277bb"));

    // Contours colour (also re-enables Contours layer)
    fireEvent.change(within(colorsSection).getByLabelText("Contours colour"), {
      target: { value: hex("aa5522") },
    });
    expect(getColour("--outline-contour").toLowerCase()).toBe(hex("aa5522"));
    expect(contoursCheckbox.checked).toBe(true);

    // Clicking "Reset colours" in Scene Layers restores all edited building use and scene layer colours to default
    const resetColoursBtn = within(layersSection).getByRole("button", { name: "Reset colours" });
    await user.click(resetColoursBtn);
    expect(getColour("--use-residential").toLowerCase()).toBe(defaultResidential);
    expect(getColour("--road-local").toLowerCase()).toBe(defaultRoadLocal);
    expect(getColour("--tree-crown").toLowerCase()).toBe(defaultTreeCrown);
    expect(getColour("--green-3d").toLowerCase()).toBe(defaultGreen3d);
    expect(getColour("--water-3d").toLowerCase()).toBe(defaultWater3d);
    expect(getColour("--outline-contour").toLowerCase()).toBe(defaultContour);
  });

  it("shows separate Hidden buildings and Edited building heights sections in Buildings and CRS positioning note in Import", async () => {
    const user = userEvent.setup();
    render(
      <ModelPage
        model={sampleModel()}
        onHome={() => {}}
        onNewCut={() => {}}
      />,
    );

    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    const rightRail = screen.getByRole("toolbar", { name: "Model info" });
    const leftPanel = document.querySelector("#model-sidebar-panel") as HTMLElement;
    const rightPanel = document.querySelector("#model-sidebar-right-panel") as HTMLElement;
    expect(leftPanel).toBeTruthy();
    expect(rightPanel).toBeTruthy();
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: /Export model/i })).toBeNull();

    // Clicking Buildings on the right rail switches the right panel while keeping Display on the left rail active and open
    await user.click(within(rightRail).getByRole("button", { name: "Buildings" }));
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    expect(screen.getByRole("heading", { name: "Hidden buildings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Edited building heights" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Manual heights" })).toBeNull();

    // Clicking the already-active right tab keeps both active
    await user.click(within(rightRail).getByRole("button", { name: "Buildings" }));
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");

    // Clicking Import on the left rail switches the left panel while keeping Buildings on the right rail active and open
    await user.click(within(leftRail).getByRole("button", { name: "Import" }));
    expect(within(leftRail).getByRole("button", { name: "Import" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    expect(screen.getByText(/Position geometry in/i)).toBeTruthy();
    expect(screen.getByText(/matching this cut's .3dm export/i)).toBeTruthy();

    // Clicking the already-active left tab keeps both active
    await user.click(within(leftRail).getByRole("button", { name: "Import" }));
    expect(within(leftRail).getByRole("button", { name: "Import" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps all three right-rail tabs (Model details, Buildings, Trees) visible even when buildings and trees are empty, and opens Trees cleanly while keeping Display open", async () => {
    const user = userEvent.setup();
    const emptyModel = {
      ...sampleModel({ withWater: false, withTrees: false }),
      buildings: [],
      trees: [],
    };
    render(
      <ModelPage
        model={emptyModel}
        onHome={() => {}}
        onNewCut={() => {}}
      />,
    );

    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    const rightRail = screen.getByRole("toolbar", { name: "Model info" });
    const leftPanel = document.querySelector("#model-sidebar-panel") as HTMLElement;
    const rightPanel = document.querySelector("#model-sidebar-right-panel") as HTMLElement;

    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(rightRail).getByRole("button", { name: "Trees" }).getAttribute("aria-pressed")).toBe("false");

    // Clicking Trees when model.trees is empty opens the Trees panel on the right while keeping Display open on the left
    await user.click(within(rightRail).getByRole("button", { name: "Trees" }));
    expect(within(rightRail).getByRole("button", { name: "Trees" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    const treeSection = rightPanel.querySelector(".drawer-section.tree-sizes") as HTMLElement;
    expect(treeSection).toBeTruthy();
    expect(treeSection.hidden).toBe(false);
    expect(within(treeSection).getByText("Tree sizes: 0 from data")).toBeTruthy();

    // Clicking Buildings when model.buildings is empty opens the Buildings panel on the right while keeping Display open on the left
    await user.click(within(rightRail).getByRole("button", { name: "Buildings" }));
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    const buildingsSection = rightPanel.querySelector(".drawer-section.legend") as HTMLElement;
    expect(buildingsSection).toBeTruthy();
    expect(buildingsSection.hidden).toBe(false);
  });

  it("renders Isometric 3D vector drawing under Display › Drawing with NW/NE/SE/SW compass selector, Layers toggles, and 2-column circular Colors swatches matching 3D model", async () => {
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

    // No floating bottom-right attribution pill on any tab
    expect(document.querySelector(".stage-attrib")).toBeNull();
    expect(document.querySelector(".map-attribution")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Drawing" }));
    const isoBtn = screen.getByRole("button", { name: "Quick Isometric" });
    await user.click(isoBtn);

    // Isometric SVG drawing renders in the viewport
    const isoSvg = document.querySelector("svg.plan.isometric-drawing") as SVGSVGElement;
    expect(isoSvg).toBeTruthy();
    expect(isoSvg.getAttribute("data-iso-corner")).toBe("sw");

    // 4-way Compass view selector (NW, NE, SE, SW)
    const cornerGroup = screen.getByRole("group", { name: "Isometric corner" });
    for (const label of ["NW", "NE", "SE", "SW"]) {
      expect(within(cornerGroup).getByRole("button", { name: label })).toBeTruthy();
    }
    await user.click(within(cornerGroup).getByRole("button", { name: "NW" }));
    expect(isoSvg.getAttribute("data-iso-corner")).toBe("nw");

    // Scene Layers section matches Display › 3D model with per-use building rows and inline colour swatches
    const layersSection = screen.getByRole("region", { name: "Layers" });
    const colorsSection = layersSection;
    expect(screen.queryByRole("region", { name: "Colors" })).toBeNull();

    for (const label of [
      "Residential",
      "Commercial",
      "Roads",
      "Footpaths",
      "Trees",
      "Landscape",
      "Water",
      "Rail & tram",
      "Contours",
    ]) {
      const toggle = within(layersSection).getByLabelText(label) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
      expect(within(layersSection).getByLabelText(`${label} colour`)).toBeTruthy();
    }
    expect(within(layersSection).queryByLabelText("Ground")).toBeNull();
    expect(within(layersSection).queryByLabelText("Blocks")).toBeNull();

    // Toggling Residential and Commercial off removes building solids from the live Isometric SVG
    expect(isoSvg.querySelectorAll(".iso-solids .iso-building").length).toBe(2);
    await user.click(within(layersSection).getByLabelText("Residential"));
    expect(isoSvg.querySelectorAll(".iso-solids .iso-building").length).toBe(1);
    await user.click(within(layersSection).getByLabelText("Commercial"));
    expect(isoSvg.querySelector(".iso-solids .iso-building")).toBeNull();

    // Picking a Residential colour re-enables Residential and updates the live colour variable
    const hex = (six: string) => `${String.fromCharCode(35)}${six}`;
    fireEvent.change(within(colorsSection).getByLabelText("Residential colour"), {
      target: { value: hex("c97a4b") },
    });
    expect((within(layersSection).getByLabelText("Residential") as HTMLInputElement).checked).toBe(true);
    expect(getColour("--use-residential").toLowerCase()).toBe(hex("c97a4b"));
    expect(isoSvg.querySelectorAll(".iso-solids .iso-building").length).toBe(1);
  });
  it("keeps the right sidebar panel opaque across Drawing and Satellite views and bounds .fill between both sidebars", () => {
    const floatingCss = readFileSync(resolve(__dirname, "../floating.css"), "utf8");
    const indexCss = readFileSync(resolve(__dirname, "../index.css"), "utf8");

    expect(floatingCss).not.toMatch(/\.viewport:not\(\.is-drawing\):not\(\.is-satellite\)\s*>\s*\.sidebar-host/);
    expect(floatingCss).toMatch(
      /\.model\s+\.viewport\s*>\s*\.sidebar-host\s+\.sidebar-panel\.is-right[\s\S]*?background:\s*var\(--panel-3d-bg\)/,
    );
    expect(floatingCss).toMatch(
      /\.model\s+\.viewport\s*>\s*\.sidebar-host\s+\.sidebar-rail\.icon-rail\.is-right-rail[\s\S]*?background:\s*var\(--panel-3d-bg\)/,
    );

    expect(indexCss).toMatch(/\.model\s+\.viewport\s*\{[^}]*--sidebar-r:\s*var\(--sidebar-panel-w\);/);
    expect(indexCss).toMatch(/\.model\s+\.viewport\s*>\s*\.fill\s*\{\s*inset:\s*0;\s*left:\s*0;\s*right:\s*0;\s*\}/);

    // Site Intelligence panel (.right-inspector) must have zero grey border and zero inner grey fill
    expect(floatingCss).toMatch(
      /\.model\s+\.right-inspector,\s*\.model\s+\.right-inspector\.hud-card\s*\{[\s\S]*?background:\s*var\(--bg-card\)\s*!important;[\s\S]*?border:\s*0\s*!important;/,
    );
    expect(floatingCss).toMatch(
      /\.model\s+\.viewport\s*>\s*\.sidebar-host\s+\.sidebar-panel\.is-right,\s*\.model\s+\.right-inspector\s+\.sidebar-panel\.is-right\s*\{[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?border:\s*0\s*!important;/,
    );
    expect(floatingCss).toMatch(/\.model\s+\.right-inspector\s+\.kpi-cell\s*\{[\s\S]*?border:\s*0\s*!important;/);
    expect(floatingCss).toMatch(/\.select\.is-loading\s+\.omnibox-stack/);
  });

  it("renders View Style heading in Display and expands the 2-row Environmental Console with zero left drawer on Analysis", async () => {
    const user = userEvent.setup();
    render(
      <ModelPage
        model={sampleModel({
          withWater: true,
          withTrees: true,
          withFootpaths: true,
          withRail: true,
        })}
        onHome={vi.fn()}
        onNewCut={vi.fn()}
      />,
    );

    const viewModesSection = screen.getByRole("region", { name: "View modes" });
    expect(within(viewModesSection).getByRole("heading", { name: "View Style" })).toBeTruthy();

    const leftOutliner = document.querySelector(".left-outliner") as HTMLElement;
    expect(leftOutliner).toBeTruthy();
    expect(leftOutliner.hidden).toBe(false);

    // Click Analysis on the left rail
    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    await user.click(within(leftRail).getByRole("button", { name: "Site Analysis" }));

    // Left outliner drawer is hidden while Analysis is active
    expect(leftOutliner.hidden).toBe(true);
    expect(leftOutliner.getAttribute("data-active-section")).toBe("analysis");

    // 2-row Environmental Console is active at bottom center
    const envConsole = screen.getByRole("region", { name: "Environmental analysis console" });
    expect(envConsole).toBeTruthy();
    expect(within(envConsole).getByRole("tab", { name: "Solar Study" })).toBeTruthy();
    expect(within(envConsole).getByRole("tab", { name: "Wind Rose" })).toBeTruthy();
    expect(within(envConsole).getByRole("tab", { name: "Viewshed Walk" })).toBeTruthy();
    expect(within(envConsole).getByLabelText("Live solar telemetry").textContent).toContain("ALT");

    // Switch to Wind Rose inside the bottom console
    await user.click(within(envConsole).getByRole("tab", { name: "Wind Rose" }));
    expect(within(envConsole).getByLabelText("Live wind telemetry").textContent).toContain("PREVAILING");

    // Switch back to Display -> left drawer reopens and compact solar bar returns
    await user.click(within(leftRail).getByRole("button", { name: "Display" }));
    expect(leftOutliner.hidden).toBe(false);
    expect(screen.queryByRole("region", { name: "Environmental analysis console" })).toBeNull();
    expect(screen.getByRole("region", { name: "Solar and camera controls" })).toBeTruthy();
  });
});
