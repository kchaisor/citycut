import { describe, expect, it, vi } from "vitest";
import { removeMapSiteLayers, updateMapSiteLayers } from "./mapSiteLayers";
import type { BuildingFeat } from "../types";

function mockMap() {
  const sources = new Set<string>();
  const layers = new Set<string>();
  return {
    map: {
      addSource: vi.fn((id: string) => sources.add(id)),
      addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
      getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
      getSource: vi.fn((id: string) => (sources.has(id) ? {} : undefined)),
      removeLayer: vi.fn((id: string) => layers.delete(id)),
      removeSource: vi.fn((id: string) => sources.delete(id)),
    },
    layers,
  };
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

describe("updateMapSiteLayers", () => {
  it("adds site preview building fill only (no cut use-colour stack)", () => {
    const { map, layers } = mockMap();
    updateMapSiteLayers(map as never, {
      center: { lon: 144.96, lat: -37.81 },
      buildings: [building],
      siteBuildingIds: [1],
      parcel: null,
    });
    expect(layers.has("citycut-site-buildings-fill")).toBe(true);
    expect(layers.has("citycut-cut-buildings-fill")).toBe(false);
    expect(layers.has("citycut-enrichment-tiles-fill")).toBe(false);
    removeMapSiteLayers(map as never);
  });
});
