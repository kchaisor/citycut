import { describe, expect, it, vi } from "vitest";
import * as pt from "./explodedAxoPt";
import type { CityModel } from "../types";

const model: CityModel = {
  placeLabel: "Melbourne",
  center: { lon: 144.96, lat: -37.81 },
  sideM: 500,
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  buildings: [],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "",
};

describe("fetchTramLinesForCut", () => {
  it("reports load failure when PTV overlays throw", async () => {
    vi.spyOn(pt, "fetchPublicTransportOverlays").mockRejectedValue(new Error("network"));
    const result = await pt.fetchTramLinesForCut(
      model,
      { south: -38, west: 144.5, north: -37.5, east: 145.5 },
    );
    expect(result.loadFailed).toBe(true);
    expect(result.lines).toBeNull();
  });
});
