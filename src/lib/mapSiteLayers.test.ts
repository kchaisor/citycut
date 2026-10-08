import { describe, expect, it, vi } from "vitest";
import {
  CUT_COLOUR_SOURCE_IDS,
  updateMapCutColourLayers,
  updateMapCutColourMask,
} from "./mapSiteLayers";
import type { BuildingFeat } from "../types";

function mockMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const addSource = vi.fn((id: string) => {
    sources.set(id, { setData: vi.fn() });
  });
  const getSource = vi.fn((id: string) => sources.get(id) ?? null);
  const addLayer = vi.fn((_layer: unknown, _before?: string) => {
    const layer = _layer as { id: string; source?: string };
    layers.add(layer.id);
  });
  const getLayer = vi.fn((id: string) => (layers.has(id) ? {} : undefined));
  const removeLayer = vi.fn((id: string) => {
    layers.delete(id);
  });
  const removeSource = vi.fn((id: string) => {
    sources.delete(id);
  });
  const once = vi.fn((_event: string, cb: () => void) => {
    cb();
  });
  const map = {
    addSource,
    getSource,
    addLayer,
    getLayer,
    removeLayer,
    removeSource,
    once,
    getStyle: () => ({
      layers: [
        { id: "waterway", type: "line" },
        { id: "building", type: "fill" },
        { id: "tunnel_motorway_casing", type: "line" },
        { id: "symbols", type: "symbol" },
      ],
    }),
  };
  return { map, sources, layers };
}

const building: BuildingFeat = {
  id: 1,
  ring: [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
    [0, 0],
  ],
  holes: [],
  height: 8,
  heightFromFallback: false,
  use: "residential",
  source: "osm_tag",
};

describe("updateMapCutColourLayers", () => {
  it("adds only building use fills and the frame mask, not water or green", () => {
    const { map, layers } = mockMap();
    updateMapCutColourLayers(map as never, {
      dataOrigin: { lon: 144.96, lat: -37.81 },
      dataSideM: 2000,
      maskCenter: { lon: 144.96, lat: -37.81 },
      cutSideM: 500,
      frameShape: "square",
      buildings: [building],
    });
    expect(layers.has("citycut-cut-buildings-fill")).toBe(true);
    expect(layers.has("citycut-cut-mask-buildings-fill")).toBe(true);
    expect(layers.has("citycut-cut-water-fill")).toBe(false);
    expect(layers.has("citycut-cut-green-fill")).toBe(false);
    expect(layers.has("citycut-cut-mask-fill")).toBe(false);
  });
});

describe("updateMapCutColourMask", () => {
  it("updates only the mask source when the frame moves, not the colour fills", () => {
    const { map, sources } = mockMap();
    updateMapCutColourLayers(map as never, {
      dataOrigin: { lon: 144.96, lat: -37.81 },
      dataSideM: 2000,
      maskCenter: { lon: 144.96, lat: -37.81 },
      cutSideM: 500,
      frameShape: "square",
      buildings: [building],
    });

    for (const id of CUT_COLOUR_SOURCE_IDS) {
      const source = sources.get(id);
      if (source) expect(source.setData).not.toHaveBeenCalled();
    }

    const maskBefore = sources.get("citycut-cut-mask")?.setData.mock.calls.length ?? 0;
    for (let step = 0; step < 20; step++) {
      updateMapCutColourMask(map as never, {
        center: { lon: 144.96 + step * 0.0001, lat: -37.81 },
        sideM: 500,
        frameShape: step % 2 === 0 ? "square" : "circle",
      });
    }

    for (const id of CUT_COLOUR_SOURCE_IDS) {
      const source = sources.get(id);
      if (source) expect(source.setData).not.toHaveBeenCalled();
    }
    expect(sources.get("citycut-cut-mask")?.setData).toHaveBeenCalledTimes(20);
    expect(maskBefore).toBe(0);
  });
});
