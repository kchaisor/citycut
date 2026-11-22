// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingExplodedAxo } from "./DrawingExplodedAxo";
import { defaultExplodedAxoSettings, type ExplodedAxoOverlayBundle, type ExplodedAxoSettings } from "../lib/explodedAxo";
import type { CityModel } from "../types";

const NOTE = "Transport from Transport for NSW Open Data, CC BY 4.0";
const overlayState: { current: ExplodedAxoOverlayBundle } = { current: {} };

vi.mock("../lib/explodedAxoOverlays", () => ({
  useExplodedAxoOverlays: () => overlayState.current,
}));

vi.mock("../lib/explodedAxoSatellite", () => ({
  fetchSatelliteFramePng: async () => null,
  satelliteFrameDataUrl: () => "",
}));

afterEach(() => {
  cleanup();
  overlayState.current = {};
});

function model(): CityModel {
  return {
    sideM: 200,
    center: { lat: -33.861, lon: 151.171 },
    frameShape: "square",
    buildings: [],
    roads: [],
    areas: [],
    trees: [],
    terrain: null,
  } as unknown as CityModel;
}

function renderWith(overlays: ExplodedAxoOverlayBundle, transport = true) {
  overlayState.current = overlays;
  const m = model();
  const base = defaultExplodedAxoSettings(m.sideM);
  const settings: ExplodedAxoSettings = {
    ...base,
    layerVisible: { ...base.layerVisible, transport, terrain: false, aerial: false, base: false },
  };
  return render(<DrawingExplodedAxo model={m} settings={settings} />).container;
}

const transport: ExplodedAxoOverlayBundle = {
  transport: {
    rail: { lines: [], stations: [[0, 0]] },
    pt: { lines: [{ mode: "bus", line: [[-40, 15], [40, 15]] }], stops: [] },
    note: NOTE,
  },
};

describe("exploded axo transport legend card", () => {
  it("shows Train, Tram and Bus in a HUD card and keeps the plate free of the legend and source note", () => {
    const container = renderWith(transport);
    const svg = container.querySelector("svg.exploded-axo")!;
    const plate = svg.querySelector('[data-axo-layer="transport"]')!;
    expect(plate).not.toBeNull();
    expect(svg.textContent).not.toContain(NOTE);
    expect(svg.querySelector(".axo-legend")).toBeNull();
    for (const label of ["Train", "Tram", "Bus"]) expect(plate.textContent).not.toContain(label);
    expect(svg.querySelector(".axo-plate-label")?.textContent).toBeTruthy();

    const card = container.querySelector("[data-transport-legend]") as HTMLElement;
    expect(card).not.toBeNull();
    expect(svg.contains(card)).toBe(false);
    expect(card.textContent).toContain("Transport");
    const rows = [...card.querySelectorAll("[data-transport-mode]")];
    expect(rows.map((row) => row.textContent)).toEqual(["Train", "Tram", "Bus"]);
    const swatches = [...card.querySelectorAll<HTMLElement>(".transport-legend-swatch")];
    expect(swatches.map((s) => s.style.background)).toEqual([
      "var(--axo-pt-train)",
      "var(--axo-pt-tram)",
      "var(--axo-pt-bus)",
    ]);
  });

  it("says Unavailable in the card, not on the plate, when transport failed", () => {
    const container = renderWith({ transport: "unavailable" });
    const svg = container.querySelector("svg.exploded-axo")!;
    expect(svg.textContent?.toLowerCase()).not.toContain("unavailable");
    const card = container.querySelector("[data-transport-legend]")!;
    expect(card.querySelector('[data-transport-legend-status="unavailable"]')?.textContent).toBe("Unavailable");
    expect(card.querySelectorAll("[data-transport-mode]")).toHaveLength(0);
  });

  it("hides the card when the Transport layer is off or still loading", () => {
    expect(renderWith(transport, false).querySelector("[data-transport-legend]")).toBeNull();
    cleanup();
    expect(renderWith({}).querySelector("[data-transport-legend]")).toBeNull();
  });
});
