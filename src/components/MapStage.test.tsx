// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapStage } from "./MapStage";
import { FRAME_FIT_MARGIN_PX, frameSidePx } from "../lib/frameFit";
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
  options: { zoom?: number };
  setPadding: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
};

const mapInstances: MockMapInstance[] = [];

const { loadBasemapStyle } = vi.hoisted(() => ({
  loadBasemapStyle: vi.fn<
    () => Promise<{
      style: { version: 8; sources: Record<string, never>; layers: never[] } | string;
      styleLoadFailed: boolean;
    }>
  >(async () => ({
    style: { version: 8, sources: {}, layers: [] },
    styleLoadFailed: false,
  })),
}));

vi.mock("../lib/loadMapStyle", () => ({
  loadBasemapStyle,
  applyBasemapStyleToMap: vi.fn((map: { setStyle: ReturnType<typeof vi.fn> }, style: unknown) => {
    map.setStyle(style);
  }),
}));

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
    options: { zoom?: number } = {};
    constructor(options: { zoom?: number }) {
      this.options = options;
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
    container = rectElement({ left: 0, top: 0, right: 1440, bottom: 900 });
    getContainer = () => this.container;
    padding = { left: 0, top: 0, right: 0, bottom: 0 };
    getPadding = () => this.padding;
    setPadding = vi.fn(function (this: MockGlMap, next: { left: number; top: number; right: number; bottom: number }) {
      this.padding = next;
    });
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
  fetchOvertureBuildingsForCut: vi.fn().mockRejectedValue(new Error("preview failed")),
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
  onFlyLanded: () => undefined,
};

function rectElement(r: { left: number; top: number; right: number; bottom: number }): HTMLDivElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r }) as DOMRect;
  return element;
}

describe("MapStage", () => {
  afterEach(() => {
    mapInstances.length = 0;
    vi.clearAllMocks();
  });

  it("removes move and moveend listeners before map.remove on unmount", async () => {
    const view = render(<MapStage {...baseProps} />);
    await waitFor(() => expect(mapInstances).toHaveLength(1));
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

  it("shows a notice when the landing site preview fails", async () => {
    const view = render(
      <MapStage
        {...baseProps}
        siteSearch={{ lon: 144.96, lat: -37.81, label: "Test address" }}
      />,
    );
    await waitFor(() => {
      expect(view.getByRole("status").textContent).toMatch(/site preview.*could not be loaded/i);
    });
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

  it("still creates the map and shows a notice when basemap style load fails", async () => {
    loadBasemapStyle.mockResolvedValueOnce({
      style: "https://tiles.openfreemap.org/styles/positron",
      styleLoadFailed: true,
    });
    render(<MapStage {...baseProps} />);
    await waitFor(() => expect(mapInstances).toHaveLength(1));
    expect(screen.getByText("Basemap style failed to load.")).toBeTruthy();
  });

  it("keeps the desktop initial zoom exactly, with or without a frame fit", async () => {
    render(<MapStage {...baseProps} initialView={{ ...baseProps.initialView, zoom: 15 }} />);
    await waitFor(() => expect(mapInstances).toHaveLength(1));
    expect(mapInstances[0]!.options.zoom).toBe(15);
  });

  it("pads the camera by the floating controls so the frame centres in the visible map", async () => {
    const chrome = rectElement({ left: 0, top: 0, right: 388, bottom: 900 });
    chrome.className = "select-chrome";
    document.body.appendChild(chrome);
    try {
      const view = render(<MapStage {...baseProps} />);
      await waitFor(() => expect(mapInstances[0]?.setPadding).toHaveBeenCalled());
      const map = mapInstances[0]!;
      expect(map.setPadding).toHaveBeenLastCalledWith({ left: 388, top: 0, right: 0, bottom: 0 });
      // Overlay toggles (basemap, frame shape) never move the viewport or re-pad.
      const paddingCalls = map.setPadding.mock.calls.length;
      view.rerender(<MapStage {...baseProps} basemap="satellite" frameShape="circle" />);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(map.flyTo).not.toHaveBeenCalled();
      expect(map.fitBounds).not.toHaveBeenCalled();
      expect(map.setPadding.mock.calls.length).toBe(paddingCalls);
    } finally {
      chrome.remove();
    }
  });

  it("zooms out on a phone so the whole frame fits the map at load", async () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(737);
    try {
      render(<MapStage {...baseProps} sideM={1200} fitFrameOnLoad initialView={{ ...baseProps.initialView, zoom: 15 }} />);
      await waitFor(() => expect(mapInstances).toHaveLength(1));
      const zoom = mapInstances[0]!.options.zoom!;
      expect(zoom).toBeLessThan(15);
      expect(frameSidePx(1200, baseProps.initialView.lat, zoom)).toBeCloseTo(390 - 2 * FRAME_FIT_MARGIN_PX, 3);
    } finally {
      width.mockRestore();
      height.mockRestore();
    }
  });
});
