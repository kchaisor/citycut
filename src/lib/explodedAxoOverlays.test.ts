import { describe, expect, it, vi } from "vitest";
import { defaultExplodedAxoSettings } from "./explodedAxo";
import { loadExplodedAxoOverlayBundle } from "./explodedAxoOverlays";
import { model } from "./aiExport.test";

vi.mock("./explodedAxoOverlayFetch", () => ({
  fetchPlanningOverlays: vi.fn().mockResolvedValue({ ok: true, data: { zones: [], overlays: [] } }),
  fetchHydroOverlays: vi.fn().mockResolvedValue({ ok: true, data: { rivers: [], wetlands: [] } }),
  fetchTopographyContours: vi.fn().mockResolvedValue({ ok: true, data: { lines: [] } }),
  fetchTransportRail: vi.fn().mockResolvedValue({ ok: false, error: "rail down" }),
}));

vi.mock("./explodedAxoPt", () => ({
  fetchPublicTransportOverlays: vi.fn().mockRejectedValue(new Error("PT tiles failed")),
}));

describe("loadExplodedAxoOverlayBundle", () => {
  it("marks transport unavailable when PT overlays throw and rail failed", async () => {
    const settings = defaultExplodedAxoSettings(model().sideM);
    const layerVisible = { ...settings.layerVisible, transport: true, planning: false, hydro: false, topography: false };
    const bundle = await loadExplodedAxoOverlayBundle(model(), layerVisible);
    expect(bundle.transport).toBe("unavailable");
  });
});
