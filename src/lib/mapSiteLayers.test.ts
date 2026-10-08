import { describe, expect, it, vi } from "vitest";
import {
  CUT_COLOUR_SOURCE_IDS,
  ensureLandingColourLayerOrder,
  ensureMapLandingColourShell,
  runWhenMapStyleReady,
  setMapCutColourData,
  updateMapCutColourLayers,
  updateMapCutColourMask,
} from "./mapSiteLayers";
import type { BuildingFeat } from "../types";

function mockMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const addLayerCalls: { id: string; before?: string }[] = [];
  const moveLayerCalls: { id: string; before?: string }[] = [];
  const addSource = vi.fn((id: string) => {
    sources.set(id, { setData: vi.fn() });
  });
  const getSource = vi.fn((id: string) => sources.get(id) ?? null);
  const addLayer = vi.fn((_layer: unknown, before?: string) => {
    const layer = _layer as { id: string; source?: string };
    layers.add(layer.id);
    addLayerCalls.push({ id: layer.id, before });
  });
  const getLayer = vi.fn((id: string) => (layers.has(id) ? {} : undefined));
  const moveLayer = vi.fn((id: string, before?: string) => {
    moveLayerCalls.push({ id, before });
  });
  const removeLayer = vi.fn((id: string) => {
    layers.delete(id);
  });
  const removeSource = vi.fn((id: string) => {
    sources.delete(id);
  });
  const once = vi.fn((_event: string, cb: () => void) => {
    cb();
  });
  let styleLoaded = true;
  let styledataWaiters: (() => void)[] = [];
  const map = {
    addSource,
    getSource,
    addLayer,
    getLayer,
    moveLayer,
    removeLayer,
    removeSource,
    once,
    on: vi.fn((event: string, cb: () => void) => {
      if (event === "styledata" || event === "idle") styledataWaiters.push(cb);
    }),
    off: vi.fn((event: string, cb: () => void) => {
      if (event === "styledata" || event === "idle") {
        styledataWaiters = styledataWaiters.filter((fn) => fn !== cb);
      }
    }),
    isStyleLoaded: () => styleLoaded,
    getStyle: () => ({
      layers: [
        { id: "waterway", type: "line" },
        { id: "building", type: "fill" },
        { id: "tunnel_motorway_casing", type: "line" },
        { id: "symbols", type: "symbol" },
      ],
    }),
  };
  const fireStyleReady = () => {
    styleLoaded = true;
    for (const fn of [...styledataWaiters]) fn();
  };
  return { map, sources, layers, addLayerCalls, moveLayerCalls, fireStyleReady, setStyleLoaded: (v: boolean) => { styleLoaded = v; } };
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

describe("runWhenMapStyleReady", () => {
  it("waits for styledata when the style is not loaded yet", () => {
    const { map, fireStyleReady, setStyleLoaded } = mockMap();
    setStyleLoaded(false);
    const fn = vi.fn();
    runWhenMapStyleReady(map as never, fn);
    expect(fn).not.toHaveBeenCalled();
    fireStyleReady();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("landing tile shell before live payload", () => {
  it("adds enrichment tiles before live GeoJSON setData", () => {
    const { map, layers } = mockMap();
    ensureMapLandingColourShell(map as never, {
      enrichmentAbsoluteUrl: "https://example.test/tiles.pmtiles",
      maskCenter: { lon: 144.96, lat: -37.81 },
      cutSideM: 1000,
      frameShape: "square",
    });
    expect(layers.has("citycut-enrichment-tiles-fill")).toBe(true);
    const applied = setMapCutColourData(map as never, {
      dataOrigin: { lon: 144.96, lat: -37.81 },
      sideM: 2000,
      buildings: [building],
    });
    expect(applied).toBe(true);
  });
});

describe("ensureMapLandingColourShell", () => {
  it("stacks live overlay above enrichment tiles so delta wins at paint time", () => {
    const { map, addLayerCalls } = mockMap();
    ensureMapLandingColourShell(map as never, {
      enrichmentAbsoluteUrl: "https://example.test/tiles.pmtiles",
      maskCenter: { lon: 144.96, lat: -37.81 },
      cutSideM: 1000,
      frameShape: "square",
    });
    const cut = addLayerCalls.find((call) => call.id === "citycut-cut-buildings-fill");
    const tile = addLayerCalls.find((call) => call.id === "citycut-enrichment-tiles-fill");
    const mask = addLayerCalls.find((call) => call.id === "citycut-cut-mask-buildings-fill");
    expect(mask?.before).toBe("tunnel_motorway_casing");
    expect(cut?.before).toBe("citycut-cut-mask-buildings-fill");
    expect(tile?.before).toBe("citycut-cut-buildings-fill");
  });
});

describe("ensureLandingColourLayerOrder", () => {
  it("moves overlay above tiles when layers already exist", () => {
    const { map, moveLayerCalls, layers } = mockMap();
    for (const id of [
      "citycut-enrichment-tiles-fill",
      "citycut-cut-buildings-fill",
      "citycut-cut-mask-buildings-fill",
    ]) {
      layers.add(id);
    }
    ensureLandingColourLayerOrder(map as never);
    expect(moveLayerCalls).toEqual([
      { id: "citycut-cut-buildings-fill", before: "citycut-cut-mask-buildings-fill" },
      { id: "citycut-enrichment-tiles-fill", before: "citycut-cut-buildings-fill" },
    ]);
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
