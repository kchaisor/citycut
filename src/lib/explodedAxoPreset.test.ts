import { describe, expect, it } from "vitest";
import {
  AXO_REFERENCE_ORDER,
  buildExplodedAxoLayers,
  defaultExplodedAxoSettings,
  explodedAxoBounds,
  liftsForLayerOrder,
  axoPlateShowsAerial,
  referenceExplodedAxoSettings,
} from "./explodedAxo";
import { explodedAxoChunks } from "./explodedAxoExport";
import type { CityModel } from "../types";

const model = { placeLabel: "T", center: { lat: -37.8136, lon: 144.9631 }, sideM: 500, frameShape: "square", layers: {}, buildings: [], roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "" } as unknown as CityModel;

describe("exploded axo reference preset", () => {
  it("uses the reference order top → bottom with only those plates visible", () => {
    const s = referenceExplodedAxoSettings(500);
    expect(s.layerOrder).toEqual(["trees", "buildings", "roads", "cadastre", "hydro", "topography", "terrain", "base"]);
    expect(s.layerOrder.filter((id) => s.layerVisible[id])).toEqual(AXO_REFERENCE_ORDER);
    expect(defaultExplodedAxoSettings(500).layerOrder).not.toContain("base");
  });

  it("opens a bigger gap above buildings only", () => {
    const s = referenceExplodedAxoSettings(500);
    const lifts = liftsForLayerOrder(s.layerOrder, s.gapM, s.extraGapAboveM);
    const gap = (upper: string, lower: string) => lifts.get(upper as never)! - lifts.get(lower as never)!;
    expect(gap("roads", "cadastre")).toBeCloseTo(s.gapM);
    expect(gap("trees", "buildings")).toBeCloseTo(s.gapM * 2.5);
    expect(gap("buildings", "roads")).toBeCloseTo(s.gapM);
  });

  it("draws a base outline plate with corner dots, also in .ai", () => {
    const s = referenceExplodedAxoSettings(500);
    const base = buildExplodedAxoLayers(model, s).layers.find((l) => l.id === "base")!;
    expect(base.liftM).toBe(0);
    expect(base.markers).toHaveLength(4);
    expect(explodedAxoChunks(model, 1000, s).some((c) => c.name === "Base")).toBe(true);
  });

  it("toggles inside the preset never move the fitted view; default stack unchanged without preset", () => {
    const s = referenceExplodedAxoSettings(500);
    const off = { ...s, layerVisible: { ...s.layerVisible, trees: false, terrain: false } };
    expect(explodedAxoBounds(model, off)).toEqual(explodedAxoBounds(model, s));
    const d = defaultExplodedAxoSettings(500);
    const plain = liftsForLayerOrder(d.layerOrder, d.gapM);
    d.layerOrder.forEach((id, i) => expect(plain.get(id)).toBeCloseTo((d.layerOrder.length - 1 - i) * d.gapM));
  });

  it("base plate carries the aerial image; .ai keeps the omitted-imagery note", async () => {
    expect(axoPlateShowsAerial("base")).toBe(true);
    expect(axoPlateShowsAerial("roads")).toBe(false);
    const s = referenceExplodedAxoSettings(500);
    const chunks = explodedAxoChunks(model, 1000, s, "Satellite imagery omitted from this file.");
    expect(JSON.stringify(chunks.find((c) => c.name === "Annotation"))).toContain("Satellite imagery omitted");
  });
});
