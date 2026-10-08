// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapStage } from "./MapStage";

type Handler = (...args: unknown[]) => void;

const mapInstances: Array<{
  off: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  handlers: Map<string, Set<Handler>>;
}> = [];

vi.mock("maplibre-gl", () => {
  class NavigationControl {}
  class MockGlMap {
    handlers = new globalThis.Map<string, Set<Handler>>();
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
vi.mock("../lib/useCascade", () => ({
  refineBuildingUses: vi.fn().mockResolvedValue({ buildings: [] }),
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
});
