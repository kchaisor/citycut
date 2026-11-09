import { describe, expect, it, beforeEach } from "vitest";
import { sitePlanLayerOrder, sitePlanSvg } from "./aiPlan";
import { clearPlanShadowCache, planShadowRings } from "./buildingShadows";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8045, lon: 145.0215 };
const box = (id: number, e: number, n: number, h: number): BuildingFeat => ({
  id,
  ring: [
    [e - 10, n - 10],
    [e + 10, n - 10],
    [e + 10, n + 10],
    [e - 10, n + 10],
    [e - 10, n - 10],
  ],
  holes: [],
  height: h,
  use: "unclassified",
  source: "none",
});
const model = {
  sideM: 300,
  center: at,
  placeLabel: "Kew VIC",
  buildings: [box(1, 0, 0, 25), box(2, 60, 40, 12)],
  roads: [],
  areas: [],
  trees: [],
  terrain: null,
} as unknown as CityModel;

describe("site plan SVG layer order", () => {
  beforeEach(() => clearPlanShadowCache());

  it("paints the Shadows layer before Buildings in the export stack", async () => {
    const shadows = planShadowRings(model, { ...at, year: 2026, month: 6, day: 21, hour: 15, minute: 0 }, true);
    expect(shadows.length).toBeGreaterThan(0);
    const svg = await sitePlanSvg(model, 1000, undefined, {
      shadows: { ...at, year: 2026, month: 6, day: 21, hour: 15, minute: 0 },
      castShadows: true,
      heliodon: {
        lat: at.lat,
        lon: at.lon,
        year: 2026,
        month: 6,
        day: 21,
        hour: 15,
        minute: 0,
        sideM: model.sideM,
      },
    });
    const groups = [...svg.matchAll(/inkscape:label="([^"]+)"/g)].map((m) => m[1]!);
    const shadowIndex = groups.indexOf("Shadows");
    const buildingIndex = groups.indexOf("Buildings");
    expect(shadowIndex).toBeGreaterThanOrEqual(0);
    expect(buildingIndex).toBeGreaterThan(shadowIndex);
    expect(sitePlanLayerOrder([]).indexOf("Shadows")).toBeLessThan(sitePlanLayerOrder([]).indexOf("Buildings"));
  });
});
