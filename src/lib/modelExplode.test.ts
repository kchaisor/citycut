import { describe, expect, it } from "vitest";
import { cameraBasis, cornersOf, dot, fitOrthoZoom, frameCentre, isoOffset, sub, ISO_CORNERS, type Aabb } from "./isoCamera";
import {
  EXPLODE_DURATION_MS,
  EXPLODE_LABEL_ROOM_PX,
  EXPLODE_LAYERS,
  EXPLODE_LAYER_LABELS,
  easeInOutCubic,
  explodedBounds,
  clampExplodeLabel,
  explodeClockAt,
  explodeFit,
  explodeFreeArea,
  explodeGapRange,
  explodeGapShare,
  explodeLabelOpacity,
  explodeLayerOfObjectName,
  explodeLayerOfSelectionKind,
  explodeOffsets,
  layerLabelAnchor,
  layerOffsets,
  liftedBox,
  noExplodeBoxes,
  resolveExplodeGapM,
  type ExplodeLayerBoxes,
} from "./modelExplode";

const HALF = 250;
const slab = (bottom: number, top: number): Aabb => ({ min: [-HALF, bottom, -HALF], max: [HALF, top, HALF] });
const BOXES: ExplodeLayerBoxes = {
  ground: slab(-20, 4),
  transport: slab(0, 5),
  buildings: slab(0, 120),
  trees: slab(1, 25),
};

describe("explode layers", () => {
  it("stacks Ground, Roads & transport, Buildings, Trees from the bottom up", () => {
    expect([...EXPLODE_LAYERS]).toEqual(["ground", "transport", "buildings", "trees"]);
    expect(EXPLODE_LAYERS.map((layer) => EXPLODE_LAYER_LABELS[layer])).toEqual([
      "Ground",
      "Roads & transport",
      "Buildings",
      "Trees",
    ]);
  });

  it("classifies city objects into the four layers, unknown names to ground", () => {
    for (const name of ["Terrain", "Ground", "BasePlinth", "GroundEdge", "Green", "Water", "Blocks", "Contours3d", "Site::Boundary", "Mystery"]) {
      expect(explodeLayerOfObjectName(name)).toBe("ground");
    }
    for (const name of ["Roads", "RailLines", "TramLines"]) expect(explodeLayerOfObjectName(name)).toBe("transport");
    for (const name of ["Buildings", "Buildings-manual", "Buildings-site", "Buildings::Site", "source:osm_tag", "BuildingEdges", "HeightEditOverlay"]) {
      expect(explodeLayerOfObjectName(name)).toBe("buildings");
    }
    expect(explodeLayerOfObjectName("Trees")).toBe("trees");
  });

  it("maps a picked thing to the layer its anchor rides on", () => {
    expect(explodeLayerOfSelectionKind("building")).toBe("buildings");
    expect(explodeLayerOfSelectionKind("imported")).toBe("buildings");
    expect(explodeLayerOfSelectionKind("tree")).toBe("trees");
    expect(explodeLayerOfSelectionKind("terrain")).toBe("ground");
    expect(explodeLayerOfSelectionKind(undefined)).toBe("ground");
  });
});

describe("layerOffsets", () => {
  const thicknesses = [10, 2, 100, 20];

  it("is all zero at progress 0", () => {
    expect(layerOffsets(thicknesses, 50, 0)).toEqual([0, 0, 0, 0]);
  });

  it("stacks each layer on the one below plus the gap at progress 1", () => {
    expect(layerOffsets(thicknesses, 50, 1)).toEqual([0, 60, 112, 262]);
  });

  it("is halfway at progress 0.5", () => {
    expect(layerOffsets(thicknesses, 50, 0.5)).toEqual([0, 30, 56, 131]);
  });

  it("moves every upper layer when the gap changes and leaves the bottom layer put", () => {
    expect(layerOffsets(thicknesses, 100, 1)).toEqual([0, 110, 212, 412]);
    expect(layerOffsets(thicknesses, 0, 1)).toEqual([0, 10, 12, 112]);
  });

  it("clamps progress outside 0..1", () => {
    expect(layerOffsets(thicknesses, 50, -1)).toEqual([0, 0, 0, 0]);
    expect(layerOffsets(thicknesses, 50, 2)).toEqual(layerOffsets(thicknesses, 50, 1));
  });
});

describe("explodeOffsets", () => {
  it("leaves exactly the gap between one layer's top and the next layer's bottom when fully exploded", () => {
    const gap = 75;
    const offsets = explodeOffsets(BOXES, gap, 1);
    expect(offsets.ground).toBe(0);
    for (let index = 1; index < EXPLODE_LAYERS.length; index++) {
      const below = EXPLODE_LAYERS[index - 1];
      const above = EXPLODE_LAYERS[index];
      const clear = BOXES[above]!.min[1] + offsets[above] - (BOXES[below]!.max[1] + offsets[below]);
      expect(clear).toBeCloseTo(gap, 9);
    }
  });

  it("is the assembled scene at progress 0", () => {
    expect(explodeOffsets(BOXES, 75, 0)).toEqual({ ground: 0, transport: 0, buildings: 0, trees: 0 });
  });

  it("skips an empty layer without adding a second gap", () => {
    const noRoads: ExplodeLayerBoxes = { ...BOXES, transport: null };
    const offsets = explodeOffsets(noRoads, 50, 1);
    expect(offsets.transport).toBe(0);
    expect(noRoads.buildings!.min[1] + offsets.buildings - noRoads.ground!.max[1]).toBeCloseTo(50, 9);
    expect(explodeOffsets(noExplodeBoxes(), 50, 1)).toEqual({ ground: 0, transport: 0, buildings: 0, trees: 0 });
  });
});

describe("explode gap slider", () => {
  it("defaults to 150 m on a 0.5 km cut, with a 10 to 400 m range in 5 m steps", () => {
    expect(explodeGapRange(500)).toEqual({ minM: 10, maxM: 400, stepM: 5, defaultM: 150 });
  });

  it("defaults to 300 m on a 1 km cut, with a 10 to 800 m range in 5 m steps", () => {
    expect(explodeGapRange(1000)).toEqual({ minM: 10, maxM: 800, stepM: 5, defaultM: 300 });
  });

  it("keeps a usable range on a tiny cut", () => {
    const range = explodeGapRange(20);
    expect(range.maxM).toBeGreaterThan(range.minM);
    expect(range.defaultM).toBeGreaterThanOrEqual(range.minM);
    expect(range.defaultM).toBeLessThanOrEqual(range.maxM);
  });

  it("uses the default until a gap is chosen, then snaps and clamps the choice", () => {
    const range = explodeGapRange(500);
    expect(resolveExplodeGapM(range, null)).toBe(150);
    expect(resolveExplodeGapM(range, 123)).toBe(125);
    expect(resolveExplodeGapM(range, 2)).toBe(10);
    expect(resolveExplodeGapM(range, 9999)).toBe(400);
    expect(explodeGapShare(range, 10)).toBe(0);
    expect(explodeGapShare(range, 400)).toBe(1);
  });
});

describe("explode animation clock", () => {
  it("eases in and out", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it("takes about 0.9 s each way", () => {
    expect(EXPLODE_DURATION_MS).toBe(900);
    expect(explodeClockAt(0, 1, 450, false)).toBeCloseTo(0.5, 9);
    expect(explodeClockAt(0.5, 1, 450, false)).toBe(1);
    expect(explodeClockAt(1, 0, 450, false)).toBeCloseTo(0.5, 9);
    expect(explodeClockAt(0.2, 0, 900, false)).toBe(0);
  });

  it("follows elapsed time, so slow frames still land on time", () => {
    let clock = 0;
    for (const elapsedMs of [0, 400, 800, 1200]) clock = explodeClockAt(0, 1, elapsedMs, false);
    expect(clock).toBe(1);
    expect(explodeClockAt(0, 1, 800, false)).toBeCloseTo(8 / 9, 9);
    expect(explodeClockAt(0.5, 0, 225, false)).toBeCloseTo(0.25, 9);
    expect(explodeClockAt(0, 1, -50, false)).toBe(0);
  });

  it("jumps straight to the end with reduced motion", () => {
    expect(explodeClockAt(0, 1, 16, true)).toBe(1);
    expect(explodeClockAt(1, 0, 16, true)).toBe(0);
    expect(explodeClockAt(0.3, 1, 0, true)).toBe(1);
  });

  it("shows labels only near the end of the explode and never while collapsing", () => {
    expect(explodeLabelOpacity(0.5, true)).toBe(0);
    expect(explodeLabelOpacity(0.85, true)).toBeCloseTo(0.5, 9);
    expect(explodeLabelOpacity(1, true)).toBe(1);
    expect(explodeLabelOpacity(1, false)).toBe(0);
  });
});

describe("exploded bounds and camera fit", () => {
  const base: Aabb = slab(-20, 120);

  it("is the assembled model at progress 0 and grows upward only", () => {
    expect(explodedBounds(base, BOXES, explodeOffsets(BOXES, 75, 0))).toEqual(base);
    const offsets = explodeOffsets(BOXES, 75, 1);
    const full = explodedBounds(base, BOXES, offsets)!;
    expect(full.min).toEqual(base.min);
    expect(full.max[0]).toBe(HALF);
    expect(full.max[2]).toBe(HALF);
    expect(full.max[1]).toBe(BOXES.trees!.max[1] + offsets.trees);
  });

  it("has no bounds when nothing was measured", () => {
    expect(explodedBounds(null, noExplodeBoxes(), explodeOffsets(noExplodeBoxes(), 75, 1))).toBeNull();
  });

  it("fits every layer inside the free area between the panels at each corner and stage, with label room on the left", () => {
    const view = { left: 0, top: 0, right: 1440, bottom: 900 };
    const safe = { left: 338, top: 72, right: 1082, bottom: 816 };
    for (const corner of ISO_CORNERS) {
      const direction = isoOffset(corner);
      const { right, up } = cameraBasis(direction);
      for (const progress of [0, 0.25, 0.5, 1]) {
        for (const gap of [10, 150, 400]) {
          const offsets = explodeOffsets(BOXES, gap, progress);
          const bounds = explodedBounds(base, BOXES, offsets)!;
          const fit = explodeFit(bounds, direction, view, safe, progress);
          const area = explodeFreeArea(view, safe, progress);
          const centre = frameCentre(bounds);
          for (const layer of EXPLODE_LAYERS) {
            for (const point of cornersOf(liftedBox(BOXES[layer]!, offsets[layer]))) {
              const rel = sub(point, centre);
              const x = (view.left + view.right) / 2 + fit.shiftXPx + dot(rel, right) * fit.zoom;
              const y = (view.top + view.bottom) / 2 + fit.shiftYPx - dot(rel, up) * fit.zoom;
              expect(x).toBeGreaterThanOrEqual(area.left - 1e-6);
              expect(x).toBeLessThanOrEqual(area.right + 1e-6);
              expect(y).toBeGreaterThanOrEqual(area.top - 1e-6);
              expect(y).toBeLessThanOrEqual(area.bottom + 1e-6);
            }
          }
        }
      }
    }
  });

  it("is the plain centred fit when assembled and the panel-free area with label room when exploded", () => {
    const view = { left: 0, top: 0, right: 1440, bottom: 900 };
    const safe = { left: 338, top: 72, right: 1082, bottom: 816 };
    const direction = isoOffset("sw");
    expect(explodeFit(base, direction, view, safe, 0)).toEqual({
      zoom: fitOrthoZoom(base, direction, 1440, 900),
      shiftXPx: 0,
      shiftYPx: 0,
    });
    expect(explodeFreeArea(view, safe, 1)).toEqual({ ...safe, left: safe.left + EXPLODE_LABEL_ROOM_PX });
    const narrow = { left: 600, top: 0, right: 800, bottom: 900 };
    expect(explodeFreeArea(view, narrow, 1).left).toBe(700);
  });

  it("keeps a label left of its anchor and inside the free area", () => {
    const safe = { left: 338, top: 72, right: 1082, bottom: 816 };
    expect(clampExplodeLabel(700, 400, 110, 20, safe)).toEqual({ x: 688, y: 400 });
    expect(clampExplodeLabel(380, 400, 110, 20, safe)).toEqual({ x: 448, y: 400 });
    expect(clampExplodeLabel(1300, 20, 110, 20, safe)).toEqual({ x: 1082, y: 82 });
    expect(clampExplodeLabel(700, 890, 110, 20, safe)).toEqual({ x: 688, y: 806 });
  });

  it("anchors a label at the screen-left bottom corner of its lifted layer", () => {
    for (const corner of ISO_CORNERS) {
      const { right } = cameraBasis(isoOffset(corner));
      const lifted = liftedBox(BOXES.buildings!, 200);
      const anchor = layerLabelAnchor(BOXES.buildings!, 200, right);
      expect(anchor[1]).toBe(lifted.min[1]);
      const leftmost = Math.min(...cornersOf(lifted).map((point) => dot(point, right)));
      expect(dot(anchor, right)).toBeCloseTo(leftmost, 9);
    }
  });
});
