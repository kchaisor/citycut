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
  axoGroundPlinthThicknessM,
  buildAxoGroundPlinth,
  reorderAxoLayer,
  planPointToIso,
  type ExplodedAxoSettings,
} from "./explodedAxo";
import { explodedAxoChunks } from "./explodedAxoExport";
import { getColour } from "./colours";
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
      expect(layers.length).toBe(8);
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
  it("puts water at the top lift and terrain at the bottom", () => {
    const settings = defaultExplodedAxoSettings(500);
    const lifts = liftsForLayerOrder(settings.layerOrder, settings.gapM);
    expect(lifts.get("terrain")).toBe(0);
    expect(lifts.get("water")!).toBeGreaterThan(lifts.get("buildings")!);
  });

  it("stores layer geometry at lift 0 for group transforms", () => {
    const m = { ...modelWithShape("square"), terrain: null };
    const settings = defaultExplodedAxoSettings(m.sideM);
    const { layers } = buildExplodedAxoLayers(m, settings);
    const terrain = layers.find((layer) => layer.id === "terrain")!;
    const water = layers.find((layer) => layer.id === "water")!;
    expect(terrain.plateOutlineD).toBe(water.plateOutlineD);
    expect(axoLayerSvgTransform(terrain.liftM)).not.toBe(axoLayerSvgTransform(water.liftM));
    expect(water.liftM).toBeGreaterThan(0);
  });

  it("paints bottom layers first so water draws on top", () => {
    const m = modelWithShape("square");
    const { layers } = buildExplodedAxoLayers(m, defaultExplodedAxoSettings(m.sideM));
    const paint = axoLayersForPaint(layers);
    expect(paint[0]?.id).toBe("terrain");
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
        terrain: false,
        roads: false,
        cadastre: false,
        green: true,
        trees: false,
        buildings: true,
        aerial: true,
        base: false,
      },
    };
    const lifts = settings.layerOrder
      .filter((id) => settings.layerVisible[id])
      .map((id) => liftsForLayerOrder(settings.layerOrder, settings.gapM).get(id)!);
    const guides = axoGuideLines(m.sideM, "circle", lifts);
    expect(guides).toHaveLength(4);
  });
});

describe("rail and tram stay off the exploded axo", () => {
  const settingsWith = (m: CityModel): ExplodedAxoSettings => {
    const s = defaultExplodedAxoSettings(m.sideM);
    return { ...s, layerVisible: { ...s.layerVisible, roads: true, transport: true } };
  };

  it("draws no rail, train or tram lines in the transport overlay; stations, stops and bus routes stay", () => {
    const m = baseModel();
    const { layers } = buildExplodedAxoLayers(m, settingsWith(m), {
      transport: {
        rail: { lines: [[[-40, 0], [40, 0]]], stations: [[0, 0]] },
        pt: {
          lines: [
            { mode: "train", line: [[-40, 5], [40, 5]] },
            { mode: "tram", line: [[-40, 10], [40, 10]] },
            { mode: "bus", line: [[-40, 15], [40, 15]] },
          ],
          stops: [
            { mode: "train", point: [5, 5] },
            { mode: "tram", point: [5, 10] },
          ],
        },
      },
    });
    const transport = layers.find((layer) => layer.id === "transport")!;
    expect(transport.strokePaints ?? []).toEqual(["pt-bus"]);
    expect(transport.strokeDashed ?? []).not.toContain(true);
    expect((transport.markers ?? []).map((marker) => marker.paint)).toEqual(["rail-station", "pt-train", "pt-tram"]);
    expect((transport.legend ?? []).map((entry) => entry.label)).not.toContain("Rail");
  });

  it("keeps the roads plate to vehicular roads, with no dashed rail or tram strokes", () => {
    const m = baseModel();
    const roads = buildExplodedAxoLayers(m, settingsWith(m)).layers.find((layer) => layer.id === "roads")!;
    expect(roads.strokeDashed ?? []).not.toContain(true);
    expect(roads.strokePaints ?? []).not.toContain("rail-line");
    expect(roads.strokePaints ?? []).not.toContain("pt-tram");
  });
});

describe("reorderAxoLayer and layerLiftM", () => {
  it("moves a dragged layer to the target slot and applies free-dragged lift overrides", () => {
    expect(reorderAxoLayer(["trees", "buildings", "roads"], "roads", "trees")).toEqual([
      "roads",
      "trees",
      "buildings",
    ]);
    const lifts = liftsForLayerOrder(["trees", "buildings", "roads"], 100, {}, { buildings: 140 });
    expect(lifts.get("roads")).toBe(0);
    expect(lifts.get("buildings")).toBe(140);
    expect(lifts.get("trees")).toBe(200);
  });
});

describe("exploded axo separate flat Aerial image plate and 3D Terrain plate (mesh + plinth + 3D contours)", () => {
  it("builds a crisp 3D ground plinth under the bottom Terrain plate for square and circle frames", () => {
    const squareModel = modelWithShape("square");
    const { layers: sqLayers } = buildExplodedAxoLayers(squareModel, defaultExplodedAxoSettings(squareModel.sideM));
    const sqTerrain = sqLayers.find((layer) => layer.id === "terrain")!;
    expect(sqTerrain.plinthThicknessM).toBe(axoGroundPlinthThicknessM(squareModel.sideM));
    expect(sqTerrain.plinthWalls).toHaveLength(2);
    expect(sqTerrain.plinthWalls!.map((w) => w.side)).toEqual(["left", "right"]);
    for (const wall of sqTerrain.plinthWalls!) {
      expect(wall.fill).toBe(getColour("--ground-fill"));
      expect(wall.stroke).toBe(getColour("--ground-edge"));
      expect(wall.d).toMatch(/^M.*Z$/);
    }

    const circleModel = modelWithShape("circle");
    const { layers: cirLayers } = buildExplodedAxoLayers(circleModel, defaultExplodedAxoSettings(circleModel.sideM));
    const cirTerrain = cirLayers.find((layer) => layer.id === "terrain")!;
    expect(cirTerrain.plinthThicknessM).toBe(axoGroundPlinthThicknessM(circleModel.sideM));
    expect(cirTerrain.plinthWalls).toHaveLength(2);
    expect(cirTerrain.plinthWalls!.map((w) => w.side)).toEqual(["left", "right"]);

    const sqAerial = sqLayers.find((l) => l.id === "aerial")!;
    expect(sqAerial).toBeDefined();
    expect(sqAerial.plinthWalls).toBeUndefined();
    expect(sqAerial.unclippedStrokes).toBeUndefined();
    expect(sqAerial.topoContourStrokes).toBeUndefined();
    for (const layer of sqLayers.filter((l) => l.id !== "terrain")) {
      expect(layer.plinthWalls).toBeUndefined();
      expect(layer.plinthThicknessM).toBeUndefined();
    }
  });

  it("undulates the Terrain plate top surface, 3D mesh, 3D contours, and plinth wall top edges with 3D terrain relief above a flat base datum", () => {
    const slopedModel: CityModel = {
      ...modelWithShape("square"),
      terrain: {
        cols: 3,
        rows: 3,
        heights: new Float32Array([10, 18, 26, 14, 22, 30, 18, 26, 34]),
        min: 10,
        max: 34,
        spacingM: 50,
        zoom: 14,
        metresPerPixel: 4,
        source: "Mapterhorn",
      },
    };
    const flatModel: CityModel = { ...slopedModel, terrain: null };
    const settings = defaultExplodedAxoSettings(slopedModel.sideM);

    const { layers: flatLayers } = buildExplodedAxoLayers(flatModel, settings);
    const { layers: slopedLayers } = buildExplodedAxoLayers(slopedModel, settings);
    const flatTerrain = flatLayers.find((l) => l.id === "terrain")!;
    const slopedTerrain = slopedLayers.find((l) => l.id === "terrain")!;

    expect(pathVertices(slopedTerrain.plateOutlineD).length).toBeGreaterThan(20);
    expect(slopedTerrain.plateOutlineD).not.toBe(flatTerrain.plateOutlineD);
    expect(slopedTerrain.plinthMaxReliefM).toBeGreaterThan(20);
    expect(slopedTerrain.unclippedStrokes?.length).toBeGreaterThan(0);
    expect(slopedTerrain.topoContourStrokes?.length).toBeGreaterThan(0);

    const leftWall = slopedTerrain.plinthWalls!.find((w) => w.side === "left")!;
    const flatLeftWall = flatTerrain.plinthWalls!.find((w) => w.side === "left")!;
    expect(leftWall.topPts.length).toBeGreaterThan(10);
    const liftedFrontCornerY = leftWall.topPts[leftWall.topPts.length - 1]![1];
    const flatFrontCornerY = flatLeftWall.topPts[flatLeftWall.topPts.length - 1]![1];
    expect(liftedFrontCornerY).toBeLessThan(flatFrontCornerY - 20);
    expect(leftWall.bottomPts).toEqual(flatLeftWall.bottomPts);
  });

  it("includes the bottom of the Terrain base slab in explodedAxoBounds and exports plinth walls + 3D contours in .ai chunks", () => {
    const m = modelWithShape("square");
    const settings = defaultExplodedAxoSettings(m.sideM);
    const bounds = explodedAxoBounds(m, settings);
    const plinth = buildAxoGroundPlinth(m.sideM, "square", m.terrain);
    const half = m.sideM / 2;
    expect(bounds.maxY).toBeGreaterThan(half + plinth.slabThicknessM);

    const chunks = explodedAxoChunks(m, 1000, settings);
    const terrainChunk = chunks.find((c) => c.name === "Terrain")!;
    expect(terrainChunk).toBeDefined();
    const aerialChunk = chunks.find((c) => c.name === "Aerial image")!;
    expect(aerialChunk).toBeDefined();
    expect(chunks.find((c) => c.name === "Aerial")).toBeUndefined();
    expect(terrainChunk.paths!.filter((p) => p.fill && p.stroke).length).toBeGreaterThanOrEqual(3);
  });
});
