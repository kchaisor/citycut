import { describe, expect, it } from "vitest";
import { axoHeightSource, axoMassingHeightNote, buildAxoMassingFaces } from "./explodedAxoMassing";
import { buildExplodedAxoLayers, defaultExplodedAxoSettings, explodedAxoBounds } from "./explodedAxo";
import { explodedAxoChunks } from "./explodedAxoExport";
import type { BuildingFeat, CityModel, Pt } from "../types";

function box(id: number, e: number, n: number, size: number, height: number, tier: BuildingFeat["heightTier"]): BuildingFeat {
  const ring: Pt[] = [
    [e, n],
    [e + size, n],
    [e + size, n + size],
    [e, n + size],
    [e, n],
  ];
  return { id, ring, holes: [], height, heightTier: tier, use: "residential", source: "osm" } as unknown as BuildingFeat;
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: { lat: -37.8136, lon: 144.9631 },
    sideM: 500,
    frameShape: "square",
    layers: {},
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  } as unknown as CityModel;
}

describe("exploded axo massing", () => {
  it("draws two viewer-facing walls in two shades plus a roof per box", () => {
    const { faces } = buildAxoMassingFaces(model([box(1, 0, 0, 20, 30, "com")]));
    expect(faces.map((f) => f.paint).sort()).toEqual(["building-roof", "building-wall-dark", "building-wall-light"]);
    expect(faces[faces.length - 1]!.paint).toBe("building-roof");
  });

  it("sorts far masses before near ones (painter's order)", () => {
    const near = box(1, 100, 100, 20, 10, "com");
    const far = box(2, -150, -150, 20, 80, "com");
    const { faces } = buildAxoMassingFaces(model([near, far]));
    const roofs = faces.filter((f) => f.paint === "building-roof");
    const firstY = Number(/M[\d.-]+ ([\d.-]+)/.exec(roofs[0]!.d)![1]);
    const lastY = Number(/M[\d.-]+ ([\d.-]+)/.exec(roofs[1]!.d)![1]);
    expect(firstY).toBeLessThan(lastY);
  });

  it("labels defaults as estimates in source priority order", () => {
    expect(axoHeightSource("development_floors")).toBe("dam");
    expect(axoHeightSource("zone_default")).toBe("estimate");
    const { counts } = buildAxoMassingFaces(
      model([box(1, 0, 0, 10, 9, "zone_default"), box(2, 50, 0, 10, 40, "com"), box(3, 0, 50, 10, 20, "osm_levels")]),
    );
    expect(axoMassingHeightNote(counts)).toBe("Heights: CoM 2023 1 · Overture/OSM 1 · default estimate 1");
  });

  it("puts solids and the note on the buildings plate", () => {
    const m = model([box(1, 0, 0, 20, 30, "com")]);
    const { layers } = buildExplodedAxoLayers(m, defaultExplodedAxoSettings(500));
    const b = layers.find((l) => l.id === "buildings")!;
    expect(b.solids?.length).toBe(3);
    expect(b.sourceNote).toContain("CoM 2023 1");
    const flat = buildExplodedAxoLayers(m, { ...defaultExplodedAxoSettings(500), buildingMassing: false });
    expect(flat.layers.find((l) => l.id === "buildings")!.solids).toBeUndefined();
  });

  it("blast radius: .ai export carries the massing faces and toggles do not change the fitted bounds", () => {
    const m = model([box(1, 0, 0, 20, 30, "com"), box(2, 60, 60, 15, 12, "zone_default")]);
    const settings = defaultExplodedAxoSettings(500);
    const chunks = explodedAxoChunks(m, 1000, settings);
    const buildings = chunks.find((c) => c.name === "Buildings");
    expect(buildings?.paths?.filter((p) => p.fill && p.stroke).length).toBe(6);
    const annotation = JSON.stringify(chunks.find((c) => c.name === "Annotation"));
    expect(annotation).toContain("default estimate 1");
    const off = { ...settings, layerVisible: { ...settings.layerVisible, buildings: false } };
    expect(explodedAxoBounds(m, off)).toEqual(explodedAxoBounds(m, settings));
  });
});
