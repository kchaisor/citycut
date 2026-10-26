// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
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
    layerVisible: { ...baseSettings.layerVisible, aerial: false, base: false },
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
  it("renders the 3D ground base slab (plinth) underneath the Satellite (aerial) plate", () => {
    vi.spyOn(satellite, "fetchSatelliteFramePng").mockResolvedValue(null);
    const model = makeTestModel();
    const settings = defaultExplodedAxoSettings(model.sideM);
    const { container } = render(<DrawingExplodedAxo model={model} settings={settings} />);

    const aerialGroup = container.querySelector("[data-axo-layer=\"aerial\"]") as SVGGElement | null;
    expect(aerialGroup).not.toBeNull();

    const groundTop = aerialGroup!.querySelector("path.axo-ground-top") as SVGPathElement | null;
    expect(groundTop).not.toBeNull();

    const plinthGroup = aerialGroup!.querySelector("g.axo-ground-plinth") as SVGGElement | null;
    expect(plinthGroup).not.toBeNull();

    const walls = plinthGroup!.querySelectorAll("path.axo-plinth-wall");
    expect(walls.length).toBe(2);
    expect(plinthGroup!.querySelector("path.axo-plinth-wall-left")).not.toBeNull();
    expect(plinthGroup!.querySelector("path.axo-plinth-wall-right")).not.toBeNull();
  });
});
