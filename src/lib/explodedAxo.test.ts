import { describe, expect, it } from "vitest";
import { model as baseModel } from "./aiExport.test";
import {
  axoFrameBoundaryRing,
  axoGuideAnchorPoints,
  axoGuideLines,
  axoPlateIsCircularRing,
  axoLabelRotationDeg,
  axoLayerLabelAnchor,
  axoLayerSvgTransform,
  axoPlateOutlineD,
  buildExplodedAxoLayers,
  axoLayersForPaint,
  axoPlateProjectedHeight,
  defaultExplodedAxoGapM,
  defaultExplodedAxoSettings,
  explodedAxoBounds,
  liftsForLayerOrder,
  planPointToIso,
  type ExplodedAxoSettings,
} from "./explodedAxo";
import type { CityModel } from "../types";

function pathVertices(d: string): [number, number][] {
  const pts: [number, number][] = [];
  const tokens = d.match(/[ML][\d.-]+ [\d.-]+/g) ?? [];
  for (const token of tokens) {
    const m = /^[ML]([\d.-]+) ([\d.-]+)/.exec(token);
    if (m) pts.push([Number(m[1]), Number(m[2])]);
  }
  return pts;
}

function modelWithShape(shape: "square" | "circle"): CityModel {
  return { ...baseModel(), frameShape: shape };
}

describe("exploded axo frame shape", () => {
  const sideM = 100;

  it("uses four corner anchors and square plate outline for a square crop", () => {
    const anchors = axoGuideAnchorPoints(sideM, "square");
    expect(anchors).toHaveLength(4);
    expect(anchors).toEqual([
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ]);

    const ring = axoFrameBoundaryRing(sideM, "square");
    expect(ring).toHaveLength(5);
    expect(axoPlateIsCircularRing(sideM, "square")).toBe(false);

    const outline = axoPlateOutlineD(sideM, "square", 0);
    const verts = pathVertices(outline);
    expect(verts.length).toBeGreaterThanOrEqual(4);
    const xs = new Set(verts.map((p) => p[0].toFixed(2)));
    expect(xs.size).toBeGreaterThan(2);
  });

  it("uses four rim anchors and a circular plate for a circle crop", () => {
    const half = sideM / 2;
    const anchors = axoGuideAnchorPoints(sideM, "circle");
    expect(anchors).toHaveLength(4);
    expect(anchors).toEqual([
      [half, 0],
      [-half, 0],
      [0, half],
      [0, -half],
    ]);

    const ring = axoFrameBoundaryRing(sideM, "circle");
    expect(ring.length).toBeGreaterThan(8);
    expect(axoPlateIsCircularRing(sideM, "circle")).toBe(true);

    const outline = axoPlateOutlineD(sideM, "circle", 0);
    const verts = pathVertices(outline);
    expect(verts.length).toBeGreaterThan(8);
  });

  it("draws four vertical guides at anchor iso-x for square and circle", () => {
    const settings = defaultExplodedAxoSettings(sideM);
    const lifts = [...liftsForLayerOrder(settings.layerOrder, settings.gapM).values()];
    const squareGuides = axoGuideLines(sideM, "square", lifts);
    const circleGuides = axoGuideLines(sideM, "circle", lifts);
    expect(squareGuides).toHaveLength(4);
    expect(circleGuides).toHaveLength(4);

    for (const guide of squareGuides) {
      expect(guide.yTop).toBeLessThan(guide.yBottom);
    }

    const half = sideM / 2;
    const eastX = planPointToIso(half, 0, 0)[0];
    const circleEast = circleGuides.find((g) => Math.abs(g.x - eastX) < 0.01);
    expect(circleEast).toBeDefined();
  });

  it("clips each layer plate to the frame shape, not an axis square", () => {
    for (const shape of ["square", "circle"] as const) {
      const m = modelWithShape(shape);
      const settings = defaultExplodedAxoSettings(m.sideM);
      const { layers } = buildExplodedAxoLayers(m, settings);
      expect(layers.length).toBe(6);
      for (const layer of layers) {
        expect(layer.clipD).toBe(layer.plateOutlineD);
        if (shape === "circle") {
          expect(pathVertices(layer.clipD).length).toBeGreaterThan(8);
        } else {
          expect(pathVertices(layer.clipD).length).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});

describe("exploded axo stack order", () => {
  it("puts water at the top lift and satellite at the bottom", () => {
    const settings = defaultExplodedAxoSettings(500);
    const lifts = liftsForLayerOrder(settings.layerOrder, settings.gapM);
    expect(lifts.get("aerial")).toBe(0);
    expect(lifts.get("water")!).toBeGreaterThan(lifts.get("buildings")!);
  });

  it("stores layer geometry at lift 0 for group transforms", () => {
    const m = modelWithShape("square");
    const settings = defaultExplodedAxoSettings(m.sideM);
    const { layers } = buildExplodedAxoLayers(m, settings);
    const aerial = layers.find((layer) => layer.id === "aerial")!;
    const water = layers.find((layer) => layer.id === "water")!;
    expect(aerial.plateOutlineD).toBe(water.plateOutlineD);
    expect(axoLayerSvgTransform(aerial.liftM)).not.toBe(axoLayerSvgTransform(water.liftM));
    expect(water.liftM).toBeGreaterThan(0);
  });

  it("paints bottom layers first so water draws on top", () => {
    const m = modelWithShape("square");
    const { layers } = buildExplodedAxoLayers(m, defaultExplodedAxoSettings(m.sideM));
    const paint = axoLayersForPaint(layers);
    expect(paint[0]?.id).toBe("aerial");
    expect(paint[paint.length - 1]?.id).toBe("water");
  });

  it("expands iso bounds when layer gap increases", () => {
    const m = modelWithShape("square");
    const tight = explodedAxoBounds(m, { ...defaultExplodedAxoSettings(m.sideM), gapM: 80 });
    const loose = explodedAxoBounds(m, { ...defaultExplodedAxoSettings(m.sideM), gapM: 1000 });
    expect(loose.maxY - loose.minY).toBeGreaterThan(tight.maxY - tight.minY);
  });

  it("defaults gap to about 40% of plate height", () => {
    const sideM = 500;
    const gap = defaultExplodedAxoGapM(sideM);
    const plateH = axoPlateProjectedHeight(sideM);
    expect(gap / plateH).toBeCloseTo(0.4, 1);
  });
});

describe("exploded axo roads plate", () => {
  it("draws vehicular centre lines only on the roads layer", () => {
    const m: CityModel = {
      ...modelWithShape("square"),
      roads: [
        { id: 1, line: [[-20, 0], [20, 0]], width: 8, kind: "road", grade: "local" },
        { id: 2, line: [[-10, -15], [10, 15]], width: 2, kind: "road", grade: "path" },
        { id: 3, line: [[0, -20], [0, 20]], width: 3, kind: "rail" },
      ],
    };
    const { layers } = buildExplodedAxoLayers(m, defaultExplodedAxoSettings(m.sideM));
    const roads = layers.find((layer) => layer.id === "roads");
    expect(roads?.strokes.length).toBe(1);
  });
});

describe("exploded axo labels", () => {
  it("flips label rotation when the plate edge points left", () => {
    const sideM = 400;
    const anchor = axoLayerLabelAnchor(sideM, 120);
    expect(anchor.rotateDeg).toBeGreaterThan(-91);
    expect(anchor.rotateDeg).toBeLessThanOrEqual(91);
    expect(axoLabelRotationDeg(-1, 0)).toBeCloseTo(0, 0);
    expect(axoLabelRotationDeg(1, 0)).toBeCloseTo(0, 0);
  });
});

describe("exploded axo layer settings", () => {
  it("does not change guide count when toggling visibility", () => {
    const m = modelWithShape("circle");
    const settings: ExplodedAxoSettings = {
      ...defaultExplodedAxoSettings(m.sideM),
      layerVisible: {
        planning: false,
        water: true,
        hydro: false,
        transport: false,
        topography: false,
        roads: false,
        green: true,
        trees: false,
        buildings: true,
        aerial: true,
      },
    };
    const lifts = settings.layerOrder
      .filter((id) => settings.layerVisible[id])
      .map((id) => liftsForLayerOrder(settings.layerOrder, settings.gapM).get(id)!);
    const guides = axoGuideLines(m.sideM, "circle", lifts);
    expect(guides).toHaveLength(4);
  });
});
