// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLOURS_KEY, getColour, resetStoredColours } from "../lib/colours";
import { greyscaleHex } from "../lib/solarGreyscale";
import { ROAD_COLOR } from "../lib/surfaceLayers";
import { ModelPage } from "./ModelPage";
import type { CityModel, Pt } from "../types";

vi.mock("./Scene3D", () => ({
  Scene3D: ({ display }: { display: { monoView?: boolean; primaryView: boolean } }) => (
    <div data-testid="scene-3d" data-mono={String(display.monoView === true)} data-primary={String(display.primaryView)} />
  ),
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

const MONO_WATER_HEX = "#D6D6D2";
const PICKED_TREE_HEX = "#2D7A47";

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

    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    const rightRail = screen.getByRole("toolbar", { name: "Model info" });
    expect(leftRail.getAttribute("aria-orientation")).toBe("horizontal");
    expect(rightRail.getAttribute("aria-orientation")).toBe("horizontal");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).queryByRole("button", { name: "Site Analysis" })).toBeNull();
    expect(leftRail.querySelector('[data-section="analysis"]')).toBeNull();
    expect(document.querySelector(".site-analysis-tabs")).toBeNull();
    expect(within(leftRail).getByRole("button", { name: "Import" })).toBeTruthy();
    expect(within(leftRail).queryByRole("button", { name: "Export" })).toBeNull();
    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(rightRail).getByRole("button", { name: "Trees" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: /Export model/i })).toBeNull();

    const tab3d = screen.getByRole("tab", { name: "3D model" });
    const tabDrawing = screen.getByRole("tab", { name: "Drawing" });
    const tabSatellite = screen.getByRole("tab", { name: "Satellite" });
    expect(tab3d.getAttribute("aria-selected")).toBe("true");

    const viewModesSection = screen.getByRole("region", { name: "View modes" });
    const projectionSection = screen.getByRole("region", { name: "Projection" });
    const layersSection = screen.getByRole("region", { name: "Layers" });
    expect(screen.queryByRole("region", { name: "Colors" })).toBeNull();

    expect(viewModesSection.compareDocumentPosition(projectionSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(projectionSection.compareDocumentPosition(layersSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(viewModesSection).getByLabelText("Primary view")).toBeTruthy();
    expect(within(viewModesSection).getByLabelText("Outlines")).toBeTruthy();

    expect(within(projectionSection).getByRole("group", { name: "Projection" })).toBeTruthy();
    await user.click(within(projectionSection).getByRole("button", { name: "Isometric" }));
    expect(within(projectionSection).getByRole("group", { name: "Isometric corner" })).toBeTruthy();
    const freeRotate = within(projectionSection).getByLabelText("Free rotate (axonometric)");
    expect(freeRotate.compareDocumentPosition(layersSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(document.querySelector(".viewport-hint")).toBeNull();
    expect(screen.queryByText(/Drag to orbit/)).toBeNull();
    expect(screen.queryByText(/Drag to pan/)).toBeNull();

    expect(screen.queryByRole("region", { name: "Building types" })).toBeNull();
    expect(screen.queryByText("Building types")).toBeNull();

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

    expect(screen.queryByRole("group", { name: "Drawing type" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Plan scale" })).toBeNull();
    expect(screen.queryByText(/Contours:/)).toBeNull();
    expect(screen.queryByText("Line styles")).toBeNull();
    expect(screen.queryByText("Colours")).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit frame" })).toBeNull();

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

    const primaryViewCheckbox = within(viewModesSection).getByLabelText("Primary view") as HTMLInputElement;
    const treesCheckbox = within(layersSection).getByLabelText("Trees") as HTMLInputElement;
    const contoursCheckbox = within(layersSection).getByLabelText("Contours") as HTMLInputElement;
    expect(primaryViewCheckbox.checked).toBe(true);
    await user.click(primaryViewCheckbox);
    await user.click(treesCheckbox);
    await user.click(contoursCheckbox);
    expect(primaryViewCheckbox.checked).toBe(false);
    expect(treesCheckbox.checked).toBe(false);
    expect(contoursCheckbox.checked).toBe(false);

    const defaultResidential = getColour("--use-residential").toLowerCase();
    const defaultRoadLocal = getColour("--road-local").toLowerCase();
    const defaultTreeCrown = getColour("--tree-crown").toLowerCase();
    const defaultGreen3d = getColour("--green-3d").toLowerCase();
    const defaultWater3d = getColour("--water-3d").toLowerCase();
    const defaultContour = getColour("--outline-contour").toLowerCase();

    fireEvent.change(within(colorsSection).getByLabelText("Residential colour"), {
      target: { value: hex("d48855") },
    });
    expect(getColour("--use-residential").toLowerCase()).toBe(hex("d48855"));
    expect(primaryViewCheckbox.checked).toBe(false);

    fireEvent.change(within(colorsSection).getByLabelText("Roads colour"), {
      target: { value: hex("556677") },
    });
    expect(getColour("--road-local").toLowerCase()).toBe(hex("556677"));
    expect(ROAD_COLOR.local.toLowerCase()).toBe(hex("556677"));
    expect(ROAD_COLOR.arterial.toLowerCase()).toBe(hex("556677"));

    fireEvent.change(within(colorsSection).getByLabelText("Trees colour"), {
      target: { value: hex("2d7a47") },
    });
    expect(getColour("--tree-crown").toLowerCase()).toBe(hex("2d7a47"));
    expect(treesCheckbox.checked).toBe(true);

    fireEvent.change(within(colorsSection).getByLabelText("Landscape colour"), {
      target: { value: hex("6ea864") },
    });
    expect(getColour("--green-3d").toLowerCase()).toBe(hex("6ea864"));

    fireEvent.change(within(colorsSection).getByLabelText("Water colour"), {
      target: { value: hex("2277bb") },
    });
    expect(getColour("--water-3d").toLowerCase()).toBe(hex("2277bb"));

    fireEvent.change(within(colorsSection).getByLabelText("Contours colour"), {
      target: { value: hex("aa5522") },
    });
    expect(getColour("--outline-contour").toLowerCase()).toBe(hex("aa5522"));
    expect(contoursCheckbox.checked).toBe(true);

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

    await user.click(within(rightRail).getByRole("button", { name: "Buildings" }));
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rightRail).getByRole("button", { name: "Model details" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    expect(screen.getByRole("heading", { name: "Hidden buildings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Edited building heights" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Manual heights" })).toBeNull();

    await user.click(within(rightRail).getByRole("button", { name: "Buildings" }));
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(within(leftRail).getByRole("button", { name: "Import" }));
    expect(within(leftRail).getByRole("button", { name: "Import" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(rightRail).getByRole("button", { name: "Buildings" }).getAttribute("aria-pressed")).toBe("true");
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    expect(screen.getByText(/Position geometry in/i)).toBeTruthy();
    expect(screen.getByText(/matching this cut's .3dm export/i)).toBeTruthy();

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

    expect(document.querySelector(".stage-attrib")).toBeNull();
    expect(document.querySelector(".map-attribution")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Drawing" }));
    const isoBtn = screen.getByRole("button", { name: "Quick Isometric" });
    await user.click(isoBtn);

    const isoSvg = document.querySelector("svg.plan.isometric-drawing") as SVGSVGElement;
    expect(isoSvg).toBeTruthy();
    expect(isoSvg.getAttribute("data-iso-corner")).toBe("sw");

    const cornerGroup = screen.getByRole("group", { name: "Isometric corner" });
    for (const label of ["NW", "NE", "SE", "SW"]) {
      expect(within(cornerGroup).getByRole("button", { name: label })).toBeTruthy();
    }
    await user.click(within(cornerGroup).getByRole("button", { name: "NW" }));
    expect(isoSvg.getAttribute("data-iso-corner")).toBe("nw");

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

    expect(isoSvg.querySelectorAll(".iso-solids .iso-building").length).toBe(2);
    await user.click(within(layersSection).getByLabelText("Residential"));
    expect(isoSvg.querySelectorAll(".iso-solids .iso-building").length).toBe(1);
    await user.click(within(layersSection).getByLabelText("Commercial"));
    expect(isoSvg.querySelector(".iso-solids .iso-building")).toBeNull();

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

    expect(floatingCss).toMatch(
      /\.model\s+\.right-inspector,\s*\.model\s+\.right-inspector\.hud-card\s*\{[\s\S]*?background:\s*var\(--bg-card\)\s*!important;[\s\S]*?border:\s*0\s*!important;/,
    );
    expect(floatingCss).toMatch(
      /\.model\s+\.viewport\s*>\s*\.sidebar-host\s+\.sidebar-panel\.is-right,\s*\.model\s+\.right-inspector\s+\.sidebar-panel\.is-right\s*\{[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?border:\s*0\s*!important;/,
    );
    expect(floatingCss).toMatch(/\.model\s+\.right-inspector\s+\.kpi-cell\s*\{[\s\S]*?border:\s*0\s*!important;/);
    expect(floatingCss).toMatch(/\.select\.is-loading\s+\.omnibox-stack/);
  });

  it("lays out view style control as one row of five segments that share the track", () => {
    const floatingCss = readFileSync(resolve(__dirname, "../floating.css"), "utf8");
    expect(floatingCss).toMatch(/\.model \.left-outliner \.style-seg[\s\S]*flex-wrap:\s*nowrap/);
    expect(floatingCss).toMatch(/\.model \.left-outliner \.style-seg[\s\S]*padding:\s*3px/);
    const btnRule = floatingCss.match(/\.model \.left-outliner \.style-seg \.style-btn \{[^}]*\}/)?.[0] ?? "";
    expect(btnRule).toMatch(/flex:\s*1 1 auto/);
    expect(btnRule).toMatch(/height:\s*32px/);
    expect(btnRule).toMatch(/padding:\s*0 8px/);
    expect(btnRule).toMatch(/font-family:\s*var\(--sans\)/);
    expect(btnRule).toMatch(/font-size:\s*11px/);
    expect(btnRule).toMatch(/font-weight:\s*500/);
    expect(btnRule).toMatch(/white-space:\s*nowrap/);
    const baseBtnRule = floatingCss.match(/\.model \.left-outliner \.style-btn \{[^}]*\}/)?.[0] ?? "";
    expect(baseBtnRule).toMatch(/height:\s*32px/);
    expect(baseBtnRule).toMatch(/padding:\s*0 8px/);
    expect(baseBtnRule).toMatch(/font-size:\s*11px/);
    expect(baseBtnRule).toMatch(/font-weight:\s*500/);
  });

  it("keeps the Scene Layers header on one row: title, visible count, then a quiet Reset, in 3D and in Drawing", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel({ withWater: true, withTrees: true })} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const checkHeader = () => {
      const head = screen.getByRole("region", { name: "Layers" }).querySelector(".card-head") as HTMLElement;
      expect(head.classList.contains("scene-layers-head")).toBe(true);
      expect(Array.from(head.children).map((child) => child.textContent?.trim())).toEqual([
        "Scene Layers",
        expect.stringMatching(/^\d+ visible$/),
        "Reset",
      ]);
      const reset = within(head).getByRole("button", { name: "Reset colours" });
      expect(reset.textContent?.trim()).toBe("Reset");
      expect(reset.getAttribute("title")).toMatch(/colours/);
    };
    checkHeader();
    await user.click(screen.getByRole("tab", { name: "Drawing" }));
    checkHeader();

    const floatingCss = readFileSync(resolve(__dirname, "../floating.css"), "utf8");
    const headRule = floatingCss.match(/\.model \.left-outliner \.card-head\.scene-layers-head \{[^}]*\}/)?.[0] ?? "";
    expect(headRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(headRule).toMatch(/white-space:\s*nowrap/);
    const countRule =
      floatingCss.match(/\.model \.left-outliner \.scene-layers-head \.scene-layers-count \{[^}]*\}/)?.[0] ?? "";
    expect(countRule).toMatch(/color:\s*var\(--ink-3\)/);
    const resetRule = floatingCss.match(/\.model \.outliner-section \.studio-reset-colours-btn \{[^}]*\}/)?.[0] ?? "";
    expect(resetRule).toMatch(/color:\s*var\(--ink-3\)/);
    expect(resetRule).toMatch(/background:\s*transparent/);
    expect(resetRule).toMatch(/border:\s*0/);
    expect(resetRule).toMatch(/margin:\s*0 0 0 auto/);
  });

  it("shows grey Scene Layers swatches and a Colours off in B&W line only while B&W is the 3D View Style", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel({ withWater: true, withTrees: true })} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Building style" });
    const layers = screen.getByRole("region", { name: "Layers" });
    const swatch = (label: string) =>
      (within(layers).getByLabelText(`${label} colour`).closest(".o-swatch-wrap") as HTMLElement).style.background.toUpperCase();
    const input = (label: string) => (within(layers).getByLabelText(`${label} colour`) as HTMLInputElement).value.toUpperCase();
    const caption = () => screen.queryByText("Colours off in B&W");
    const isGreyHex = (value: string) => /^#([0-9A-F]{2})\1\1$/.test(value);
    const tree = getColour("--tree-crown").toUpperCase();
    const water = getColour("--water-3d").toUpperCase();
    const residential = getColour("--use-residential").toUpperCase();

    for (const style of ["Primary", "Use", "Source", "Card"]) {
      await user.click(within(group).getByRole("button", { name: style }));
      expect(caption()).toBeNull();
      expect(swatch("Trees")).toBe(tree);
      expect(swatch("Water")).toBe(water);
      expect(swatch("Residential")).toBe(residential);
    }

    await user.click(within(group).getByRole("button", { name: "Black and white" }));
    expect(caption()?.classList.contains("style-seg-caption")).toBe(true);
    expect(group.nextElementSibling).toBe(caption());
    expect(swatch("Trees")).toBe(greyscaleHex(tree));
    expect(swatch("Trees")).not.toBe(tree);
    expect(isGreyHex(swatch("Trees"))).toBe(true);
    expect(swatch("Residential")).toBe(greyscaleHex(residential));
    expect(isGreyHex(swatch("Residential"))).toBe(true);
    expect(swatch("Water")).toBe(MONO_WATER_HEX);
    expect(swatch("Trees")).not.toBe(MONO_WATER_HEX);
    expect(input("Trees")).toBe(tree);
    expect(input("Water")).toBe(water);
    expect(getColour("--tree-crown").toUpperCase()).toBe(tree);
    expect(getColour("--water-3d").toUpperCase()).toBe(water);
    expect(window.localStorage.getItem(COLOURS_KEY)).toBeNull();

    fireEvent.change(within(layers).getByLabelText("Trees colour"), { target: { value: PICKED_TREE_HEX } });
    expect(getColour("--tree-crown").toUpperCase()).toBe(PICKED_TREE_HEX);
    expect(swatch("Trees")).toBe(greyscaleHex(PICKED_TREE_HEX));

    await user.click(within(group).getByRole("button", { name: "Primary" }));
    expect(caption()).toBeNull();
    expect(swatch("Trees")).toBe(PICKED_TREE_HEX);
    expect(swatch("Water")).toBe(water);

    await user.click(screen.getByRole("tab", { name: "Drawing" }));
    expect(caption()).toBeNull();
    const floatingCss = readFileSync(resolve(__dirname, "../floating.css"), "utf8");
    const captionRule = floatingCss.match(/\.model \.left-outliner \.style-seg-caption \{[^}]*\}/)?.[0] ?? "";
    expect(captionRule).toMatch(/font-family:\s*var\(--sans\)/);
    expect(captionRule).toMatch(/font-size:\s*11px/);
    expect(captionRule).toMatch(/font-weight:\s*500/);
    expect(captionRule).toMatch(/white-space:\s*nowrap/);
    expect(captionRule).toMatch(/color:\s*var\(--ink-3\)/);
  });

  it("lists Primary, Use, Source, Card and B&W in the 3D View Style group, opening on Primary in colour", () => {
    render(<ModelPage model={sampleModel({})} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Building style" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Primary", "Use", "Src", "Card", "B&W"]);
    expect(within(group).getByRole("button", { name: "Source" }).textContent).toBe("Src");
    expect(within(group).getByRole("button", { name: "Black and white" }).textContent).toBe("B&W");
    expect(buttons.filter((button) => button.getAttribute("aria-pressed") === "true").map((b) => b.textContent)).toEqual([
      "Primary",
    ]);
    expect(screen.getByTestId("scene-3d").getAttribute("data-mono")).toBe("false");
  });

  it("keeps the View Style colours when Solar Study is turned on or off, for Primary, Use, Source and Card", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel({})} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Building style" });
    const envConsole = screen.getByRole("region", { name: "Environmental analysis console" });
    const solarStudy = within(envConsole).getByRole("button", { name: "Solar Study" });
    const pressed = () =>
      within(group)
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.getAttribute("aria-label"));

    for (const style of ["Primary", "Use", "Source", "Card"]) {
      await user.click(within(group).getByRole("button", { name: style }));
      await user.click(solarStudy);
      expect(solarStudy.getAttribute("aria-pressed")).toBe("true");
      expect(pressed()).toEqual([style]);
      expect(screen.getByTestId("scene-3d").getAttribute("data-mono")).toBe("false");
      await user.click(solarStudy);
      expect(solarStudy.getAttribute("aria-pressed")).toBe("false");
      expect(pressed()).toEqual([style]);
      expect(screen.getByTestId("scene-3d").getAttribute("data-mono")).toBe("false");
    }
  });

  it("greys the 3D scene only for the B&W View Style, with or without Solar Study, and restores colour on Primary", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel({})} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Building style" });
    const envConsole = screen.getByRole("region", { name: "Environmental analysis console" });
    const solarStudy = within(envConsole).getByRole("button", { name: "Solar Study" });
    const bw = within(group).getByRole("button", { name: "Black and white" });
    const primary = within(group).getByRole("button", { name: "Primary" });
    const scene = () => screen.getByTestId("scene-3d");

    await user.click(bw);
    expect(solarStudy.getAttribute("aria-pressed")).toBe("false");
    expect(bw.getAttribute("aria-pressed")).toBe("true");
    expect(primary.getAttribute("aria-pressed")).toBe("false");
    expect(scene().getAttribute("data-mono")).toBe("true");

    await user.click(solarStudy);
    expect(bw.getAttribute("aria-pressed")).toBe("true");
    expect(scene().getAttribute("data-mono")).toBe("true");

    await user.click(primary);
    expect(solarStudy.getAttribute("aria-pressed")).toBe("true");
    expect(primary.getAttribute("aria-pressed")).toBe("true");
    expect(bw.getAttribute("aria-pressed")).toBe("false");
    expect(scene().getAttribute("data-mono")).toBe("false");

    await user.click(within(group).getByRole("button", { name: "Use" }));
    await user.click(bw);
    expect(scene().getAttribute("data-mono")).toBe("true");
    await user.click(within(group).getByRole("button", { name: "Card" }));
    expect(scene().getAttribute("data-mono")).toBe("false");
    expect(scene().getAttribute("data-primary")).toBe("false");
  });

  it("has no Section Knife or Tools section in the left Display drawer, in 3D or Drawing", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel({})} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const leftOutliner = document.querySelector(".left-outliner") as HTMLElement;
    const assertNoKnife = () => {
      expect(screen.queryByRole("region", { name: "Section Knife" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Section Knife/i })).toBeNull();
      expect(screen.queryByText(/Section Knife/i)).toBeNull();
      expect(within(leftOutliner).queryByRole("heading", { name: "Tools" })).toBeNull();
      expect(document.querySelector(".section-knife-tools, .section-knife-toggle, .section-knife-elevation")).toBeNull();
    };
    assertNoKnife();
    await user.click(screen.getByRole("tab", { name: "Drawing" }));
    assertNoKnife();
    expect(screen.queryByRole("button", { name: "Black and white" })).toBeNull();
    for (const file of ["model/ModelPageSidebarLeftA.tsx", "model/ModelPageViewportTabs.tsx", "model/useModelPage.tsx"]) {
      expect(readFileSync(resolve(__dirname, file), "utf8")).not.toMatch(/SectionKnife/i);
    }
  });

  it("keeps the one-row Analysis bar always on, opens each analysis in its own right card, and folds the others like an accordion", async () => {
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

    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    expect(within(leftRail).queryByRole("button", { name: "Site Analysis" })).toBeNull();

    const envConsole = screen.getByRole("region", { name: "Environmental analysis console" });
    expect(within(envConsole).getByText("Analysis")).toBeTruthy();
    for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) {
      expect(within(envConsole).getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
    expect(within(envConsole).queryByRole("button", { name: "Walk Ripple" })).toBeNull();
    expect(within(envConsole).getByRole("group", { name: "Render quality" })).toBeTruthy();
    expect(within(envConsole).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Solar Study",
      "Wind Rose",
      "Viewshed Walk",
      "High",
      "Fast",
    ]);
    expect(document.querySelector(".analysis-hud-card")).toBeNull();
    expect(screen.queryByLabelText("Live solar telemetry")).toBeNull();
    expect(screen.queryByRole("region", { name: "Solar and camera controls" })).toBeNull();
    const card = (kind: string) => document.querySelector<HTMLElement>(`[data-analysis-card="${kind}"]`);
    const expanded = (kind: string) => card(kind)?.querySelector(".analysis-card-head")?.getAttribute("aria-expanded");

    await user.click(within(envConsole).getByRole("button", { name: "Solar Study" }));
    expect(leftOutliner.hidden).toBe(false);
    const solarCard = card("solar")!;
    expect(expanded("solar")).toBe("true");
    expect(within(solarCard).getByLabelText("Live solar telemetry").textContent).toContain("Alt");
    expect(within(solarCard).getByRole("group", { name: "Solar overlays" })).toBeTruthy();
    expect(within(solarCard).getByRole("group", { name: "Solar date presets" })).toBeTruthy();
    expect(within(solarCard).getByRole("slider", { name: "Solar time of day" })).toBeTruthy();
    expect(within(solarCard).getByRole("slider", { name: "Sun dome size" })).toBeTruthy();
    expect(within(envConsole).queryByLabelText("Live solar telemetry")).toBeNull();
    expect(document.querySelector(".right-inspector")?.className).toContain("is-folded");

    await user.click(within(envConsole).getByRole("button", { name: "Wind Rose" }));
    expect(within(envConsole).getByRole("button", { name: "Solar Study" }).getAttribute("aria-pressed")).toBe("true");
    expect(expanded("wind")).toBe("true");
    expect(expanded("solar")).toBe("false");
    expect(card("solar")!.querySelector(".analysis-card-body")).toBeNull();
    expect(within(card("wind")!).getByRole("group", { name: "Wind season presets" })).toBeTruthy();
    expect(within(envConsole).queryByRole("group", { name: "Wind season presets" })).toBeNull();

    await user.click(card("solar")!.querySelector<HTMLElement>(".analysis-card-head")!);
    expect(expanded("solar")).toBe("true");
    expect(expanded("wind")).toBe("false");

    await user.click(within(envConsole).getByRole("button", { name: "Viewshed Walk" }));
    expect(expanded("view")).toBe("true");
    expect(expanded("solar")).toBe("false");
    expect(expanded("wind")).toBe("false");
    expect(within(card("view")!).getByRole("button", { name: "Draw path" })).toBeTruthy();

    await user.click(within(envConsole).getByRole("button", { name: "Viewshed Walk" }));
    expect(card("view")).toBeNull();
    expect(expanded("solar")).toBe("true");

    await user.click(within(envConsole).getByRole("button", { name: "Solar Study" }));
    expect(card("solar")).toBeNull();
    expect(expanded("wind")).toBe("true");

    await user.click(within(envConsole).getByRole("button", { name: "Wind Rose" }));
    expect(document.querySelector(".analysis-hud-card")).toBeNull();
    expect(document.querySelector(".right-inspector")?.className).not.toContain("is-folded");
    expect(screen.getByRole("region", { name: "Environmental analysis console" })).toBeTruthy();
  });
});
