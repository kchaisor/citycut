// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";
import type { BuildingFeat } from "./types";

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
  },
}));

vi.mock("./components/ModelPage", () => ({
  ModelPage: () => (
    <div className="model">
      <div className="viewport">
        <canvas className="scene-canvas" />
      </div>
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
  fetchOvertureBuildingsForCut: vi.fn().mockResolvedValue({
    buildings: [sampleBuilding],
    buildingCapHit: false,
    stats: emptyBuildingStats,
  }),
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
  comRecordsToTrees: vi.fn(() => []),
}));
vi.mock("./lib/vicmapTrees", () => ({
  fetchVicmapTrees: vi.fn().mockResolvedValue([]),
  vicmapPointsToTrees: vi.fn(() => []),
  VICMAP_ATTRIBUTION: "",
}));
vi.mock("./lib/vicmapContours", () => ({
  loadContoursForCut: vi.fn().mockResolvedValue(null),
}));
vi.mock("./lib/explodedAxoPt", () => ({
  fetchTramLinesForCut: vi.fn().mockResolvedValue(null),
}));
vi.mock("./lib/nominatim", () => ({
  reverseLocality: vi.fn().mockResolvedValue("East Melbourne"),
  localityCacheKey: vi.fn(() => "k"),
}));
vi.mock("./lib/treeTiers", () => ({
  MAX_TREE_INSTANCES: 1000,
  assembleTreeTiers: vi.fn(() => ({ trees: [], capHit: false })),
}));

/** Landing + create-model must not read real enrichment PMTiles (slow range fetches in jsdom). */
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

describe("App model stage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.history.replaceState({}, "", "/citycut/?lat=-37.8136&lon=144.9831&km=1");
  });

  it("opens the model viewport after Create model finishes", async () => {
    const user = userEvent.setup();
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: /^Create model$/i }));
    await waitFor(
      () => {
        expect(document.querySelector(".model .viewport")).toBeTruthy();
      },
      { timeout: 15000 },
    );
    expect(document.querySelector(".scene-canvas")).toBeTruthy();
  });
});
