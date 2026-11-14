// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";
import type { BuildingFeat } from "./types";
import { fetchOvertureBuildingsForCut } from "./lib/overtureBuildings";

const { sampleBuilding, emptyBuildingStats } = vi.hoisted(() => ({
  sampleBuilding: {
    id: 1,
    ring: [
      [0, 0],
      [30, 0],
      [30, 30],
      [0, 30],
      [0, 0],
    ],
    holes: [],
    height: 12,
    heightFromFallback: false,
    use: "commercial" as const,
    source: "osm_tag" as const,
  } satisfies BuildingFeat,
  emptyBuildingStats: {
    release: "",
    tileCount: 0,
    fetchMs: 0,
    fragmentCount: 0,
    buildingCount: 0,
    hasMicrosoftFootprints: false,
    stacWarning: null as string | null,
  },
}));

vi.mock("./lib/loadMapStyle", () => ({
  loadBasemapStyle: vi.fn(async () => ({
    style: { version: 8, sources: {}, layers: [] },
    styleLoadFailed: false,
  })),
}));

vi.mock("./components/ModelPage", () => ({
  ModelPage: ({ onNewCut }: { onNewCut: () => void }) => (
    <div className="model">
      <div className="viewport">
        <canvas className="scene-canvas" />
      </div>
      <button type="button" onClick={onNewCut}>
        New cut
      </button>
    </div>
  ),
}));

vi.mock("maplibre-gl", () => {
  class NavigationControl {}
  class MockGlMap {
    private sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    private layers = new Set<string>();
    on = vi.fn((event: string, fn: () => void) => {
      if (event === "load") queueMicrotask(() => fn());
    });
    off = vi.fn();
    once = vi.fn((_event: string, fn: () => void) => {
      queueMicrotask(() => fn());
    });
    remove = vi.fn();
    addControl = vi.fn();
    dragRotate = { disable: vi.fn() };
    touchPitch = { disable: vi.fn() };
    touchZoomRotate = { disableRotation: vi.fn() };
    keyboard = { disableRotation: vi.fn() };
    getPitch = () => 0;
    getBearing = () => 0;
    setPitch = vi.fn();
    setBearing = vi.fn();
    getLayer = vi.fn((id: string) => (this.layers.has(id) ? {} : undefined));
    getSource = vi.fn((id: string) => this.sources.get(id) ?? undefined);
    addSource = vi.fn((id: string) => {
      this.sources.set(id, { setData: vi.fn() });
    });
    addLayer = vi.fn((layer: { id: string }) => {
      this.layers.add(layer.id);
    });
    moveLayer = vi.fn();
    removeLayer = vi.fn((id: string) => {
      this.layers.delete(id);
    });
    removeSource = vi.fn((id: string) => {
      this.sources.delete(id);
    });
    getStyle = () => ({
      layers: [
        { id: "waterway", type: "line" },
        { id: "building", type: "fill" },
        { id: "tunnel_motorway_casing", type: "line" },
        { id: "symbols", type: "symbol" },
      ],
    });
    isStyleLoaded = () => true;
    getCenter = () => ({ lng: 144.9831, lat: -37.8136 });
    getZoom = () => 15;
    getBounds = () => ({
      getSouth: () => -37.82,
      getWest: () => 144.97,
      getNorth: () => -37.8,
      getEast: () => 144.99,
    });
    project = () => ({ x: 200, y: 200 });
    loaded = () => true;
    fire = vi.fn();
    setStyle = vi.fn();
    isMoving = () => false;
    fitBounds = vi.fn();
    flyTo = vi.fn();
  }
  return { default: { Map: MockGlMap, NavigationControl } };
});

vi.mock("./lib/fetchTerrain", () => ({
  fetchTerrainForCut: vi.fn().mockResolvedValue(null),
}));
vi.mock("./lib/overtureBuildings", () => ({
  fetchOvertureBuildingsForCut: vi.fn(),
}));
vi.mock("./lib/overtureTransportation", () => ({
  fetchOvertureTransportationForCut: vi.fn().mockResolvedValue({
    roads: [],
    roadKm: 0,
    stats: { release: "", tileCount: 0, fetchMs: 0, segmentCount: 0, skippedTomTom: 0 },
  }),
}));
vi.mock("./lib/overtureBase", () => ({
  fetchOvertureBaseForCut: vi.fn().mockResolvedValue({
    areas: [],
    treeContext: { canopy: [], buildings: [], water: [], roads: [] },
    overtureTrees: [],
    stats: {
      release: "",
      tileCount: 0,
      fetchMs: 0,
      waterCount: 0,
      greenCount: 0,
      overtureTreeCount: 0,
      hasEsaLandCover: false,
    },
  }),
}));
vi.mock("./lib/useCascade", () => ({
  loadUseTiers: vi.fn().mockResolvedValue({ zones: null, failures: [] }),
  assignExternalUses: vi.fn((buildings: BuildingFeat[]) => buildings),
  refineBuildingUses: vi.fn(async (buildings: BuildingFeat[]) => ({ buildings })),
}));
vi.mock("./lib/comTrees", () => ({
  fetchComTrees: vi.fn().mockResolvedValue([]),
  fetchComTreesDetailed: vi.fn().mockResolvedValue({ rows: [], error: null, partial: false }),
  comRecordsToTrees: vi.fn(() => []),
}));
vi.mock("./lib/vicmapTrees", () => ({
  fetchVicmapTrees: vi.fn().mockResolvedValue([]),
  fetchVicmapTreesDetailed: vi.fn().mockResolvedValue({ rows: [], error: null, partial: false }),
  vicmapPointsToTrees: vi.fn(() => []),
  VICMAP_ATTRIBUTION: "",
}));
vi.mock("./lib/vicmapContours", () => ({
  loadContoursForCut: vi.fn().mockResolvedValue(null),
}));
vi.mock("./lib/explodedAxoPt", () => ({
  fetchTramLinesForCut: vi.fn().mockResolvedValue({ lines: null, loadFailed: false }),
}));
vi.mock("./lib/nominatim", () => ({
  reverseLocality: vi.fn().mockResolvedValue("East Melbourne"),
  localityCacheKey: vi.fn(() => "k"),
}));
vi.mock("./lib/comBuildingHeights", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/comBuildingHeights")>();
  return {
    ...mod,
    fetchComBuildingFootprintsWithStats: vi.fn().mockResolvedValue({
      footprints: [],
      stats: { requestCount: 0, recordCount: 0, payloadBytes: 0, fetchMs: 0 },
    }),
  };
});
vi.mock("./lib/comDevelopmentFloors", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/comDevelopmentFloors")>();
  return { ...mod, fetchDevelopmentFloorRecords: vi.fn().mockResolvedValue([]) };
});
vi.mock("./lib/treeTiers", () => ({
  MAX_TREE_INSTANCES: 1000,
  assembleTreeTiers: vi.fn(() => ({ trees: [], capHit: false })),
}));
vi.mock("./lib/buildingEnrichmentTiles", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/buildingEnrichmentTiles")>();
  return {
    ...mod,
    fetchEnrichmentManifest: vi.fn().mockResolvedValue({
      extent: { west: 144.88, south: -37.85, east: 145.05, north: -37.78 },
      builtBbox: { west: 144.88, south: -37.85, east: 145.05, north: -37.78 },
      featureCount: 1,
      pmtilesBytes: 1,
      generatedAt: "1970-01-01T00:00:00.000Z",
      overtureRelease: "2026-09-23.1",
    }),
    getEnrichmentPmtilesAbsoluteUrl: vi
      .fn()
      .mockResolvedValue("https://test.invalid/citycut/building-enrichment.pmtiles"),
    fetchBuildingEnrichmentForCut: vi.fn().mockResolvedValue({
      byId: new Map(),
      error: null as string | null,
    }),
  };
});

function appSiteBuildActive(): string | null {
  return document.querySelector(".app")?.getAttribute("data-site-build-active") ?? null;
}

function enableBridgeIntroPath() {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("App site build chrome", () => {
  const nativeUserAgent = navigator.userAgent;

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: nativeUserAgent,
    });
  });

  beforeEach(() => {
    window.history.replaceState({}, "", "/citycut/?lat=-37.8136&lon=144.9831&km=1");
    enableBridgeIntroPath();
    vi.mocked(fetchOvertureBuildingsForCut).mockReset();
  });

  it("clears data-site-build-active after a failed build", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchOvertureBuildingsForCut).mockRejectedValue(new Error("network down"));
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: /^Create model$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(appSiteBuildActive()).toBeNull();
    expect(screen.getByRole("button", { name: /^Create model$/i })).toBeTruthy();
  }, 20_000);

  it("clears data-site-build-active when the user cancels a hung build", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchOvertureBuildingsForCut).mockImplementation(
      (_bounds, _origin, _sideM, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: /^Create model$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(appSiteBuildActive()).toBeNull());
    expect(screen.getByRole("button", { name: /^Create model$/i })).toBeTruthy();
  }, 20_000);

  it("clears data-site-build-active on New cut before intro-done", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchOvertureBuildingsForCut).mockResolvedValue({
      buildings: [sampleBuilding],
      buildingCapHit: false,
      stats: emptyBuildingStats,
      stacWarning: null,
    });
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: /^Create model$/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^New cut$/i })).toBeTruthy());
    expect(appSiteBuildActive()).toBe("true");
    await user.click(screen.getByRole("button", { name: /^New cut$/i }));
    await waitFor(() => expect(appSiteBuildActive()).toBeNull());
    expect(screen.getByRole("button", { name: /^Create model$/i })).toBeTruthy();
  }, 20_000);

  it("clears data-site-build-active when citycut:intro-done fires on the success path", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchOvertureBuildingsForCut).mockResolvedValue({
      buildings: [sampleBuilding],
      buildingCapHit: false,
      stats: emptyBuildingStats,
      stacWarning: null,
    });
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: /^Create model$/i }));
    await waitFor(() => expect(document.querySelector(".model")).toBeTruthy());
    expect(appSiteBuildActive()).toBe("true");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("citycut:intro-done"));
    });
    expect(appSiteBuildActive()).toBeNull();
  }, 20_000);
});
