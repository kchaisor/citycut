// @vitest-environment happy-dom
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapStage } from "./MapStage";
import {
  fetchBuildingEnrichmentForCut,
  fetchEnrichmentManifest,
  getEnrichmentPmtilesAbsoluteUrl,
} from "../lib/buildingEnrichmentTiles";

type Handler = (...args: unknown[]) => void;

type MockMapInstance = {
  off: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  handlers: Map<string, Set<Handler>>;
  addLayer: ReturnType<typeof vi.fn>;
  addLayerCalls: string[];
};

const mapInstances: MockMapInstance[] = [];

vi.mock("../lib/buildingEnrichmentTiles", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/buildingEnrichmentTiles")>();
  return {
    ...mod,
    fetchBuildingEnrichmentForCut: vi.fn(),
    fetchEnrichmentManifest: vi.fn(),
    getEnrichmentPmtilesAbsoluteUrl: vi.fn(),
  };
});

vi.mock("maplibre-gl", () => {
  class NavigationControl {}
  class MockGlMap {
    handlers = new globalThis.Map<string, Set<Handler>>();
    addLayer = vi.fn((layer: { id: string }) => {
      this.addLayerCalls.push(layer.id);
    });
    addLayerCalls: string[] = [];
    constructor() {
      mapInstances.push(this);
    }
    off = vi.fn(function (this: MockGlMap, event: string, fn: Handler) {
      this.handlers.get(event)?.delete(fn);
    });
    remove = vi.fn(() => {
      const index = mapInstances.indexOf(this);
      if (index >= 0) mapInstances.splice(index, 1);
    });
    on = vi.fn(function (this: MockGlMap, event: string, fn: Handler) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(fn);
      if (event === "load") queueMicrotask(() => fn());
    });
    once = vi.fn();
    addControl = vi.fn();
    dragRotate = { disable: vi.fn() };
    touchPitch = { disable: vi.fn() };
    touchZoomRotate = { disableRotation: vi.fn() };
    keyboard = { disableRotation: vi.fn() };
    getPitch = () => 0;
    getBearing = () => 0;
    setPitch = vi.fn();
    setBearing = vi.fn();
    getLayer = vi.fn(() => undefined);
    getSource = vi.fn(() => undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn();
    getCenter = () => ({ lng: 144.96, lat: -37.81 });
    getZoom = () => 15;
    getBounds = () => ({
      getSouth: () => -37.82,
      getWest: () => 144.95,
      getNorth: () => -37.8,
      getEast: () => 144.97,
    });
    project = () => ({ x: 100, y: 100 });
    loaded = () => true;
    fire = vi.fn();
    setStyle = vi.fn();
    isMoving = () => false;
    fitBounds = vi.fn();
    flyTo = vi.fn();
  }
  return { default: { Map: MockGlMap, NavigationControl } };
});

vi.mock("../lib/overtureBuildings", () => ({
  fetchOvertureBuildingsForCut: vi.fn().mockResolvedValue({ buildings: [] }),
}));
vi.mock("../lib/sitePreviewCache", () => ({
  fetchSiteParcelCached: vi.fn(),
  siteBuildingIdsForPreview: vi.fn(() => []),
}));

const baseProps = {
  basemap: "map" as const,
  sideM: 1000,
  frameShape: "square" as const,
  initialView: { lon: 144.9631, lat: -37.8136, zoom: 14 },
  fly: null,
  loading: false,
  siteSearch: null,
  onCancel: () => undefined,
  onView: () => undefined,
  onBasemap: () => undefined,
  onFlyLanded: () => undefined,
};

describe("MapStage", () => {
  afterEach(() => {
    mapInstances.length = 0;
    vi.clearAllMocks();
  });

  it("removes move and moveend listeners before map.remove on unmount", () => {
    const view = render(<MapStage {...baseProps} />);
    expect(mapInstances).toHaveLength(1);
    const map = mapInstances[0]!;
    expect(map.handlers.get("move")?.size).toBeGreaterThan(0);
    expect(map.handlers.get("moveend")?.size).toBeGreaterThan(0);
    view.unmount();
    expect(map.off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("move", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("moveend", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(map.handlers.get("move")?.size ?? 0).toBe(0);
  });

  it("does not fetch enrichment or add use-colour map layers on landing", async () => {
    render(<MapStage {...baseProps} />);
    await waitFor(() => expect(mapInstances).toHaveLength(1));
    await waitFor(() => {
      expect(fetchBuildingEnrichmentForCut).not.toHaveBeenCalled();
      expect(fetchEnrichmentManifest).not.toHaveBeenCalled();
      expect(getEnrichmentPmtilesAbsoluteUrl).not.toHaveBeenCalled();
    });
    const map = mapInstances[0]!;
    const colourLayerIds = map.addLayerCalls.filter(
      (id: string) =>
        id.includes("citycut-cut-buildings") ||
        id.includes("citycut-enrichment") ||
        id.includes("citycut-cut-mask"),
    );
    expect(colourLayerIds).toEqual([]);
  });
});
