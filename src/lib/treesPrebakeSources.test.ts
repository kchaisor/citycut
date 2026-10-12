import { describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { buildDataSources } from "./dataSources";
import { prebakeBackupNote } from "./treesPrebake";

function model(over: Partial<CityModel> = {}): CityModel {
  return {
    placeLabel: "Toorak",
    center: { lat: -37.84886, lon: 145.01256 },
    sideM: 1200,
    layers: { buildings: false, roads: false, waterGreen: false, trees: true },
    buildings: [],
    roads: [],
    areas: [],
    trees: [{ id: 1, at: [0, 0], height_m: 8, crown_diameter_m: 6, trunk_diameter_m: 0.3, sizeSource: "vicmap", tier: "vicmap" }],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
    ...over,
  } as CityModel;
}
const rowsFor = (m: CityModel) => buildDataSources({ model: m, comHeights: "outside", comMeasuredCount: 0, comError: null });

describe("Model details: pre-baked tree file row", () => {
  it("shows the file's data dates when it was used", () => {
    const row = rowsFor(
      model({ treeSource: { kind: "prebake", builtAt: "2026-10-12", vicmapDate: "2025-06-04", comDate: "2025-09-22", osmFromFile: true } }),
    ).find((r) => r.id === "trees-file");
    expect(row).toMatchObject({
      status: "ok",
      detail: "Built 2026-10-12 · Vicmap data 2025-06-04 · CoM data 2025-09-22",
      notes: [],
    });
  });

  it("shows the backup note whenever the live servers were used", () => {
    const note = prebakeBackupNote("the pre-baked tree manifest answered HTTP 404");
    const row = rowsFor(
      model({
        treeSource: { kind: "live", reason: "the pre-baked tree manifest answered HTTP 404" },
        treeLoadNotes: [{ source: "prebake", message: note }],
      }),
    ).find((r) => r.id === "trees-file");
    expect(row).toMatchObject({ status: "failed", detail: "Live servers used (backup)", notes: [note] });
  });

  it("adds no row when trees are off", () => {
    const rows = rowsFor(model({ layers: { buildings: false, roads: false, waterGreen: false, trees: false } }));
    expect(rows.find((r) => r.id === "trees-file")).toBeUndefined();
  });
});
