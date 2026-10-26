// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingExplodedAxo } from "./DrawingExplodedAxo";
import * as satellite from "../lib/explodedAxoSatellite";
import { defaultExplodedAxoSettings, type ExplodedAxoSettings } from "../lib/explodedAxo";
import type { CityModel } from "../types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeTestModel(): CityModel {
  return {
    sideM: 200,
    center: { lat: -37.8045, lon: 145.0215 },
    frameShape: "square",
    buildings: [
      {
        id: 1,
        ring: [
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, -20],
        ],
        holes: [],
        height: 15,
        use: "residential",
        source: "overture",
      },
    ],
    roads: [],
    areas: [],
    trees: [],
    terrain: null,
  } as unknown as CityModel;
}

function setup() {
  const onLayerLiftChange = vi.fn();
  const onViewportChange = vi.fn();
  const model = makeTestModel();
  const baseSettings = defaultExplodedAxoSettings(model.sideM);
  const settings: ExplodedAxoSettings = {
    ...baseSettings,
    layerVisible: { ...baseSettings.layerVisible, terrain: false, aerial: false, base: false },
  };
  const { container } = render(
    <DrawingExplodedAxo
      model={model}
      settings={settings}
      onLayerLiftChange={onLayerLiftChange}
      onViewportChange={onViewportChange}
    />,
  );
  const svg = container.querySelector("svg.plan.exploded-axo") as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 600,
      height: 600,
      right: 600,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  svg.setPointerCapture = vi.fn();
  return { container, svg, onLayerLiftChange, onViewportChange };
}

describe("DrawingExplodedAxo and UI drag text-selection prevention", () => {
  it("disables user-select on the exploded-axo SVG, layers, callout labels, and left/right sidebar tabs and panels while keeping inputs selectable", () => {
    const { svg, container } = setup();
    expect(svg.style.userSelect).toBe("none");

    const layerGroup = container.querySelector("[data-axo-layer]") as SVGGElement | null;
    expect(layerGroup).not.toBeNull();
    expect(layerGroup!.style.userSelect).toBe("none");

    const labelGroup = container.querySelector(".axo-plate-label") as SVGGElement | null;
    expect(labelGroup).not.toBeNull();
    expect(labelGroup!.style.userSelect).toBe("none");

    const indexCss = readFileSync(join(__dirname, "../index.css"), "utf8");
    const floatingCss = readFileSync(join(__dirname, "../floating.css"), "utf8");
    const combinedCss = `${indexCss}\n${floatingCss}`;

    expect(combinedCss).toMatch(/\.plan\.exploded-axo[\s\S]*?user-select:\s*none/);
    for (const selector of [
      ".model",
      ".model .viewport",
      ".sidebar-host",
      ".select-chrome",
      ".sidebar",
      ".sidebar-rail",
      ".sidebar-panel",
      ".drawer-section",
    ]) {
      expect(floatingCss).toContain(selector);
    }
    expect(floatingCss).toMatch(/input,\s*textarea\s*\{[^}]*user-select:\s*text/);
  });

  it("prevents default and clears browser text selection when dragging a layer or callout label up and down", () => {
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      removeAllRanges,
    } as unknown as Selection);

    const { container, svg, onLayerLiftChange } = setup();
    const labelGroup = container.querySelector(".axo-plate-label") as SVGGElement;

    const downEvent = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 300,
      pointerId: 1,
    });
    labelGroup.dispatchEvent(downEvent);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(removeAllRanges).toHaveBeenCalled();

    const moveEvent = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 240,
      pointerId: 1,
    });
    svg.dispatchEvent(moveEvent);
    expect(moveEvent.defaultPrevented).toBe(true);
    expect(onLayerLiftChange).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(svg, { pointerId: 1 });
  });

  it("prevents default and clears browser text selection when panning the exploded-axo canvas", () => {
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      removeAllRanges,
    } as unknown as Selection);

    const { svg, onViewportChange } = setup();
    onViewportChange.mockClear();

    const downEvent = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200,
      pointerId: 2,
    });
    svg.dispatchEvent(downEvent);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(removeAllRanges).toHaveBeenCalled();

    const moveEvent = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: 240,
      clientY: 260,
      pointerId: 2,
    });
    svg.dispatchEvent(moveEvent);
    expect(moveEvent.defaultPrevented).toBe(true);
    expect(onViewportChange).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(svg, { pointerId: 2 });
  });
  it("renders a 3D Terrain plate (mesh, plinth, 3D contours, no satellite image) and a separate flat Aerial image plate", async () => {
    vi.spyOn(satellite, "fetchSatelliteFramePng").mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    const model: CityModel = {
      ...makeTestModel(),
      terrain: {
        cols: 3,
        rows: 3,
        heights: new Float32Array([10, 16, 22, 14, 20, 26, 18, 24, 30]),
        min: 10,
        max: 30,
        spacingM: 50,
        zoom: 14,
        metresPerPixel: 4,
        source: "Mapterhorn",
      },
    };
    const settings = defaultExplodedAxoSettings(model.sideM);
    const { container } = render(<DrawingExplodedAxo model={model} settings={settings} />);

    const terrainGroup = container.querySelector("[data-axo-layer=\"terrain\"]") as SVGGElement | null;
    expect(terrainGroup).not.toBeNull();

    const groundTop = terrainGroup!.querySelector("path.axo-ground-top") as SVGPathElement | null;
    expect(groundTop).not.toBeNull();

    const groundContours = terrainGroup!.querySelector("g.axo-ground-contours") as SVGGElement | null;
    expect(groundContours).not.toBeNull();
    expect(groundContours!.querySelectorAll("path").length).toBeGreaterThan(0);

    const plinthGroup = terrainGroup!.querySelector("g.axo-ground-plinth") as SVGGElement | null;
    expect(plinthGroup).not.toBeNull();

    const walls = plinthGroup!.querySelectorAll("path.axo-plinth-wall");
    expect(walls.length).toBe(2);
    expect(plinthGroup!.querySelector("path.axo-plinth-wall-left")).not.toBeNull();
    expect(plinthGroup!.querySelector("path.axo-plinth-wall-right")).not.toBeNull();

    const aerialGroup = container.querySelector("[data-axo-layer=\"aerial\"]") as SVGGElement | null;
    expect(aerialGroup).not.toBeNull();
    expect(aerialGroup!.querySelector("g.axo-ground-plinth")).toBeNull();
    expect(aerialGroup!.querySelector("path.axo-ground-top")).toBeNull();
    expect(aerialGroup!.querySelector("g.axo-ground-contours")).toBeNull();

    await waitFor(() => {
      expect(aerialGroup!.querySelector("image.axo-satellite-image")).not.toBeNull();
    });
    expect(terrainGroup!.querySelector("image.axo-satellite-image")).toBeNull();
  });
});
