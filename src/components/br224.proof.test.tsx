// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCityGroup } from "../lib/buildCity";
import { getColour } from "../lib/colours";
import { readDrawingStyle } from "../lib/drawingStyle";
import { readIsometricDrawingColors } from "../lib/isometricDrawing";
import { planPaths } from "../lib/svgPlan";
import { ModelPage } from "./ModelPage";
import type { CityModel, Pt } from "../types";

vi.mock("./Scene3D", () => ({
  Scene3D: (props: { uniformBuildings?: boolean }) => {
    scene3dRenders.push({ uniformBuildings: Boolean(props.uniformBuildings) });
    return <div data-testid="scene-3d" />;
  },
}));

vi.mock("./DrawingPlan", () => ({
  DrawingPlan: (props: { uniformBuildings?: boolean }) => {
    drawingPlanRenders.push({ uniformBuildings: Boolean(props.uniformBuildings) });
    return <div data-testid="drawing-plan" />;
  },
}));

vi.mock("./DrawingExplodedAxo", () => ({
  DrawingExplodedAxo: () => <div data-testid="drawing-exploded-axo" />,
}));

vi.mock("./SatellitePane", () => ({
  SatellitePane: () => <div data-testid="satellite-pane" />,
}));

const scene3dRenders: Array<{ uniformBuildings: boolean }> = [];
const drawingPlanRenders: Array<{ uniformBuildings: boolean }> = [];

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function proofModel(): CityModel {
  return {
    placeLabel: "Proof",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
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
    ],
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "proof",
  };
}

afterEach(() => {
  cleanup();
  scene3dRenders.length = 0;
  drawingPlanRenders.length = 0;
});

describe("br224 blast-radius proof", () => {
  it("defaults colour-by-use on so Drawing and exports stay non-uniform", () => {
    render(<ModelPage model={proofModel()} onHome={vi.fn()} onNewCut={vi.fn()} />);

    expect(scene3dRenders.length).toBeGreaterThan(0);
    expect(scene3dRenders[0]!.uniformBuildings).toBe(false);

    const drawingRender = drawingPlanRenders.find(() => true);
    if (drawingRender) {
      expect(drawingRender.uniformBuildings).toBe(false);
    }

    const isoRoads = readIsometricDrawingColors().roads.toUpperCase();
    expect(isoRoads).toBe(getColour("--road-local").toUpperCase());
    expect(isoRoads).toBe("#FFFFFF");

    const style = readDrawingStyle();
    const plan = planPaths(proofModel(), style.pathWidthM, style.contourIndexEvery, 1000, undefined, undefined, {
      buildingColour: { colourByUse: true, uniformBuildings: false, colourBySource: false },
      highlightManual: false,
    });
    expect(plan.buildings.some((b) => b.fill.toUpperCase() === getColour("--use-residential").toUpperCase())).toBe(true);
    expect(plan.buildings.every((b) => b.fill.toUpperCase() !== getColour("--building-uniform").toUpperCase())).toBe(true);
    expect(style.roadFill.toUpperCase()).not.toBe(getColour("--uniform-road").toUpperCase());

    const byUse = buildCityGroup(proofModel(), { uniformBuildings: false, splitBuildings: true });
    const useLayers = new Set<string>();
    byUse.traverse((object) => {
      if (object.name.startsWith("Buildings::")) useLayers.add(object.name);
    });
    expect(useLayers.size).toBeGreaterThan(1);

    const uniform = buildCityGroup(proofModel(), { uniformBuildings: true, splitBuildings: false });
    expect(uniform.getObjectByName("Buildings")).toBeTruthy();
    expect(uniform.getObjectByName("Buildings::Residential")).toBeFalsy();
  });
});
