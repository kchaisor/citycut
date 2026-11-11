import { describe, expect, it } from "vitest";
import { axoCanopyNote, axoCrownSource, buildAxoCanopyFaces } from "./explodedAxoCanopies";
import { buildExplodedAxoLayers, defaultExplodedAxoSettings } from "./explodedAxo";
import { explodedAxoChunks } from "./explodedAxoExport";
import type { CityModel, TreeFeat } from "../types";

const tree = (id: number, e: number, n: number, crown: number, src: TreeFeat["sizeSource"]): TreeFeat => ({
  id,
  at: [e, n],
  height_m: 12,
  crown_diameter_m: crown,
  trunk_diameter_m: 0.4,
  sizeSource: src,
});

const model = (trees: TreeFeat[]) =>
  ({ placeLabel: "T", center: { lat: -37.8, lon: 144.9 }, sideM: 500, frameShape: "square", layers: {}, buildings: [], roads: [], areas: [], trees, roadKm: 0, buildingCapHit: false, sourceNote: "" }) as unknown as CityModel;

describe("exploded axo tree canopies", () => {
  it("sizes the crown from crown data and sorts far to near", () => {
    const { faces } = buildAxoCanopyFaces(model([tree(1, 100, 100, 10, "com"), tree(2, -100, -100, 4, "species")]));
    const crowns = faces.filter((f) => f.paint === "tree-canopy");
    expect(crowns).toHaveLength(2);
    const width = (d: string) => {
      const xs = [...d.matchAll(/[ML]([\d.-]+) /g)].map((m) => Number(m[1]));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(crowns[0]!.d)).toBeCloseTo(4, 0);
    expect(width(crowns[1]!.d)).toBeCloseTo(10, 0);
  });

  it("labels species/default sizes as estimates and drops trees outside the frame", () => {
    expect(axoCrownSource("vicmap")).toBe("measured");
    const { counts } = buildAxoCanopyFaces(model([tree(1, 0, 0, 8, "com"), tree(2, 10, 0, 8, "default"), tree(3, 900, 0, 8, "com")]));
    expect(axoCanopyNote(counts)).toBe("Crowns: measured 1 · species/default estimate 1");
  });

  it("puts canopies on the trees plate and in the .ai Trees layer", () => {
    const m = model([tree(1, 0, 0, 8, "com")]);
    const settings = defaultExplodedAxoSettings(500);
    const t = buildExplodedAxoLayers(m, settings).layers.find((l) => l.id === "trees")!;
    expect(t.solids?.length).toBe(3);
    expect(t.markers).toBeUndefined();
    const chunk = explodedAxoChunks(m, 1000, settings).find((c) => c.name === "Trees");
    expect(chunk?.paths?.filter((p) => p.fill && !p.stroke).length).toBe(3);
  });
});
