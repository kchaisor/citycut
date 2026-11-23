// @vitest-environment happy-dom
import { useEffect } from "react";
import type * as THREE from "three";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qaSchemeMassing } from "../lib/qaSchemeFixture";
import { ModelPage } from "./ModelPage";
import type { LandmarkScreenState } from "./LandmarkLabelProjector";
import type { CityModel, Pt } from "../types";

const LANDMARK_NAME = "Eureka Tower";
const IMPORTED_NAMES = qaSchemeMassing(0).buildings.map((building) => building.name);

type SceneProps = {
  importedMassing?: THREE.Object3D | null;
  onLandmarkScreens?: (state: LandmarkScreenState | null) => void;
  onImportedLabels?: (state: unknown) => void;
};

vi.mock("./Scene3D", () => ({
  Scene3D: ({ importedMassing, onLandmarkScreens, onImportedLabels }: SceneProps) => {
    const names: string[] = [];
    importedMassing?.traverse((object) => {
      if (object.userData.importedBuildingId != null) names.push(object.name);
    });
    const joined = names.join("|");
    useEffect(() => {
      onLandmarkScreens?.({
        moving: false,
        labels: [{ buildingId: 1, name: LANDMARK_NAME, rank: 1, x: 700, y: 300, east: 0, north: 0, roofUp: 12 }],
      });
      onImportedLabels?.({
        moving: false,
        labels: names.map((name, index) => ({
          fileId: "qa-scheme",
          buildingId: name,
          name,
          x: 500 + index * 120,
          y: 420,
        })),
      });
    }, [joined, onLandmarkScreens, onImportedLabels]);
    return <div data-testid="scene-3d" data-imported-names={joined} />;
  },
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

function sampleModel(): CityModel {
  return {
    placeLabel: "Southbank",
    center: { lon: 144.9645, lat: -37.8216 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      { id: 1, ring: square(-10, -10, 10, 10), holes: [], height: 12, use: "residential", source: "osm_tag" },
    ],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("3D name labels with imported buildings present", () => {
  const originalUrl = window.location.href;

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/citycut/?qa=1&qaMassing=scheme");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", originalUrl);
  });

  it("shows landmark labels but no floating name label for imported buildings", async () => {
    render(<ModelPage model={sampleModel()} onHome={vi.fn()} onNewCut={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId("scene-3d").getAttribute("data-imported-names")).toBe(IMPORTED_NAMES.join("|")),
    );
    expect(IMPORTED_NAMES).toEqual(["Tower A", "Podium", "Tower B"]);
    const toggle = document.querySelector<HTMLInputElement>(".landmark-toggle input")!;
    if (!toggle.checked) fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);

    const landmarkLayer = await waitFor(() => {
      const layer = document.querySelector('[data-landmark-labels="3d"]');
      expect(layer).not.toBeNull();
      return layer!;
    });
    await waitFor(() =>
      expect([...landmarkLayer.querySelectorAll(".landmark-label.is-visible")].map((el) => el.textContent)).toEqual([
        LANDMARK_NAME,
      ]),
    );

    expect(document.querySelector("[data-imported-labels]")).toBeNull();
    expect(document.querySelector("[data-imported-building-id]")).toBeNull();
    const viewport = screen.getByTestId("scene-3d").parentElement!;
    const floating = [
      ...document.querySelectorAll(".landmark-label-layer *, .landmark-label"),
      ...viewport.querySelectorAll("button"),
    ];
    expect(floating.map((el) => el.textContent?.trim()).filter((text) => IMPORTED_NAMES.includes(text ?? ""))).toEqual([]);
  });
});
