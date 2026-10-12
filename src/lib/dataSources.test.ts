import { describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { buildDataSources, countLoaded, overtureReleaseFromNote } from "./dataSources";

function model(over: Partial<CityModel> = {}): CityModel {
  return {
    placeLabel: "East Melbourne",
    center: { lat: -37.8127, lon: 144.98061 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "Flat ground. Map features from Overture Maps (2025-09-24.0): buildings z14.",
    ...over,
  } as CityModel;
}

describe("buildDataSources", () => {
  it("labels inferred roundabout islands as estimates, with the count", () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 0]];
    const rows = buildDataSources({
      model: model({
        areas: [
          { id: 1, kind: "green", ring, holes: [] },
          { id: -1, kind: "green", ring, holes: [], estimate: "roundabout-island" },
          { id: -2, kind: "green", ring, holes: [], estimate: "roundabout-island" },
        ],
      }),
      comHeights: "on",
      comMeasuredCount: 0,
      comError: null,
    });
    const row = rows.find((r) => r.id === "roundabout-islands")!;
    expect(row.label).toBe("Roundabout islands (estimate)");
    expect(row.detail).toBe("2 estimated");
    expect(row.notes[0]).toMatch(/^Roundabout island \(estimate\): .*inferred from the road ring$/);
    const none = buildDataSources({ model: model(), comHeights: "on", comMeasuredCount: 0, comError: null });
    expect(none.find((r) => r.id === "roundabout-islands")).toBeUndefined();
  });

  it("has no building-permit row, even for a stale BCA failure id", () => {
    const rows = buildDataSources({
      model: model({
        useTierFailures: [
          { id: "enrichment_bca_blocked", tier: "enrichment_tiles", message: "Building permit (BCA): blocked by source (403)" },
        ],
      }),
      comHeights: "on",
      comMeasuredCount: 1210,
      comError: null,
    });
    expect(rows.find((row) => row.id === "bca")).toBeUndefined();
    expect(JSON.stringify(rows)).not.toMatch(/BCA|permit/i);
    expect(rows.find((row) => row.id === "com-heights")?.detail).toContain("1,210 buildings measured");
  });

  it("offers Retry on failed CoM heights and keeps the error", () => {
    const rows = buildDataSources({
      model: model(),
      comHeights: "failed",
      comMeasuredCount: 0,
      comError: "HTTP 503",
    });
    const com = rows.find((row) => row.id === "com-heights");
    expect(com).toMatchObject({ status: "failed", retry: "com-heights", notes: ["HTTP 503"] });
  });

  it("drops the CoM rows outside the City of Melbourne", () => {
    const rows = buildDataSources({ model: model(), comHeights: "outside", comMeasuredCount: 0, comError: null });
    expect(rows.some((row) => row.id === "com-heights" || row.id === "com-dam")).toBe(false);
  });

  it("reads terrain failure, tram failure and parcel notes from the model", () => {
    const rows = buildDataSources({
      model: model({
        layers: { buildings: false, roads: true, waterGreen: false, trees: false },
        terrain: null,
        terrainError: "Terrain tiles could not be read.",
        tramLinesLoadFailed: true,
        siteAnchor: { lat: -37.81, lon: 144.98 },
        siteParcelPfi: null,
        siteNote: "Property boundary could not be loaded.",
      }),
      comHeights: "outside",
      comMeasuredCount: 0,
      comError: null,
    });
    expect(rows.find((row) => row.id === "terrain")).toMatchObject({ status: "failed", notes: ["Terrain tiles could not be read."] });
    expect(rows.find((row) => row.id === "trams")?.status).toBe("failed");
    expect(rows.find((row) => row.id === "parcel")?.notes).toEqual(["Property boundary could not be loaded."]);
  });

  it("marks a missing tree tier failed and keeps the #88 tree-source note", () => {
    const rows = buildDataSources({
      model: model({
        layers: { buildings: false, roads: false, waterGreen: false, trees: true },
        treeLoadNotes: [{ source: "com", message: "City of Melbourne tree records took too long, so that tier is missing." }],
      }),
      comHeights: "outside",
      comMeasuredCount: 0,
      comError: null,
    });
    expect(rows.find((row) => row.id === "trees-com")).toMatchObject({
      status: "failed",
      notes: ["City of Melbourne tree records took too long, so that tier is missing."],
    });
    expect(rows.find((row) => row.id === "trees-vicmap")?.status).toBe("idle");
  });

  it("counts loaded rows, leaving out sources that are not used", () => {
    const rows = buildDataSources({ model: model(), comHeights: "loading", comMeasuredCount: 0, comError: null });
    expect(countLoaded(rows)).toEqual({ loaded: 3, total: 4 });
  });
});

describe("note helpers", () => {
  it("reads the Overture release", () => {
    expect(overtureReleaseFromNote("x Overture Maps (2025-09-24.0): y")).toBe("2025-09-24.0");
    expect(overtureReleaseFromNote("none")).toBe(null);
  });
});
