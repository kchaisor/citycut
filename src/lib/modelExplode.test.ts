import { describe, expect, it } from "vitest";
import { cameraBasis, cornersOf, dot, fitOrthoZoom, frameCentre, isoOffset, sub, ISO_CORNERS, type Aabb } from "./isoCamera";
import {
  EXPLODE_DURATION_MS,
  EXPLODE_LABEL_ROOM_PX,
  EXPLODE_LAYERS,
  EXPLODE_LAYER_LABELS,
  easeInOutCubic,
  explodedBounds,
  boundaryLabelAnchor,
  explodeClockAt,
  explodeFit,
  explodeFreeArea,
  explodeGapRange,
  explodeGapShare,
  explodeLabelOpacity,
  explodeLayerOfObjectName,
  explodeLayerOfSelectionKind,
  explodeOffsets,
  explodeCornerPoints,
  explodeCornerSpan,
  explodeOutlineSpecs,
  layoutExplodeLabels,
  separateExplodeLabels,
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
  water: slab(0, 1),
  parks: slab(0, 1),
  transport: slab(0, 5),
  buildings: slab(0, 120),
  trees: slab(1, 25),
};

describe("explode layers", () => {
  it("stacks Ground, Water, Parks, Roads & transport, Buildings, Trees from the bottom up", () => {
    expect([...EXPLODE_LAYERS]).toEqual(["ground", "water", "parks", "transport", "buildings", "trees"]);
    expect(EXPLODE_LAYERS.map((layer) => EXPLODE_LAYER_LABELS[layer])).toEqual([
      "Ground",
      "Water",
      "Parks",
      "Roads & transport",
      "Buildings",
      "Trees",
    ]);
  });

  it("classifies city objects into the six layers, unknown names to ground", () => {
    for (const name of ["Terrain", "Ground", "BasePlinth", "GroundEdge", "Blocks", "Contours3d", "Site::Boundary", "Mystery"]) {
      expect(explodeLayerOfObjectName(name)).toBe("ground");
    }
    expect(explodeLayerOfObjectName("Water")).toBe("water");
    expect(explodeLayerOfObjectName("Green")).toBe("parks");
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
    expect(explodeOffsets(BOXES, 75, 0)).toEqual({ ground: 0, water: 0, parks: 0, transport: 0, buildings: 0, trees: 0 });
  });

  it("skips an empty layer without adding a second gap", () => {
    const noRoads: ExplodeLayerBoxes = { ...BOXES, transport: null };
    const offsets = explodeOffsets(noRoads, 50, 1);
    expect(offsets.transport).toBe(offsets.parks);
    expect(noRoads.buildings!.min[1] + offsets.buildings - (noRoads.parks!.max[1] + offsets.parks)).toBeCloseTo(50, 9);
    const noWater: ExplodeLayerBoxes = { ...BOXES, water: null, parks: null };
    const dry = explodeOffsets(noWater, 50, 1);
    expect(dry.water).toBe(0);
    expect(dry.parks).toBe(0);
    expect(noWater.transport!.min[1] + dry.transport - noWater.ground!.max[1]).toBeCloseTo(50, 9);
    expect(explodeOffsets(noExplodeBoxes(), 50, 1)).toEqual({ ground: 0, water: 0, parks: 0, transport: 0, buildings: 0, trees: 0 });
  });
});

describe("explodeOutlineSpecs", () => {
  it("gives one outline per present layer at that layer's lifted base", () => {
    const noParks: ExplodeLayerBoxes = { ...BOXES, parks: null };
    const offsets = explodeOffsets(noParks, 50, 1);
    const specs = explodeOutlineSpecs(noParks, offsets);
    expect(specs.map((spec) => spec.layer)).toEqual(["ground", "water", "transport", "buildings", "trees"]);
    for (const spec of specs) expect(spec.baseY).toBe(noParks[spec.layer]!.min[1] + offsets[spec.layer]);
    expect(specs[0].baseY).toBe(-20);
  });

  it("sits at the resting bases at progress 0", () => {
    for (const spec of explodeOutlineSpecs(BOXES, explodeOffsets(BOXES, 50, 0))) expect(spec.baseY).toBe(BOXES[spec.layer]!.min[1]);
  });
});

describe("explodeCornerPoints", () => {
  it("keeps the 4 corners of a rectangle, open or closed", () => {
    const ring: [number, number][] = [[-5, -3], [5, -3], [5, 3], [-5, 3]];
    expect(explodeCornerPoints(ring)).toEqual(ring);
    expect(explodeCornerPoints([...ring, ring[0]])).toEqual(ring);
  });

  it("drops straight-through vertices and keeps only turns over 30 degrees", () => {
    const ring: [number, number][] = [[0, 0], [5, 0], [10, 0], [10, 10], [5, 10.5], [0, 10]];
    expect(explodeCornerPoints(ring)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it("gives none for a circle-like ring", () => {
    const ring: [number, number][] = Array.from({ length: 64 }, (_, i) => [
      100 * Math.cos((i / 64) * 2 * Math.PI),
      100 * Math.sin((i / 64) * 2 * Math.PI),
    ]);
    expect(explodeCornerPoints(ring)).toEqual([]);
  });
});

describe("explodeCornerSpan", () => {
  it("runs from the bottom layer base to the top layer base and grows with the gap", () => {
    const at = (gap: number, progress: number) => explodeCornerSpan(explodeOutlineSpecs(BOXES, explodeOffsets(BOXES, gap, progress)))!;
    expect(at(50, 1).baseY).toBe(BOXES.ground!.min[1]);
    expect(at(100, 1).heightM).toBeGreaterThan(at(50, 1).heightM);
    expect(at(50, 1).heightM).toBeGreaterThan(at(50, 0).heightM);
  });

  it("is absent with a single layer", () => {
    expect(explodeCornerSpan([{ layer: "ground", baseY: 0 }])).toBeNull();
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

  it("anchors a label at the boundary's left-most screen point at the layer height, whatever the layer geometry", () => {
    const ring: [number, number][] = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF], [-HALF, -HALF]];
    const parksInMiddle: Aabb = { min: [-20, 0, -20], max: [20, 1, 20] };
    for (const corner of ISO_CORNERS) {
      const { right } = cameraBasis(isoOffset(corner));
      const offset = 200;
      const anchor = boundaryLabelAnchor(ring, parksInMiddle.min[1] + offset, right)!;
      expect(anchor[1]).toBe(offset);
      const leftmost = Math.min(...ring.map(([east, north]) => dot([east, offset, -north], right)));
      expect(dot(anchor, right)).toBeCloseTo(leftmost, 9);
      expect(Math.abs(anchor[0])).toBe(HALF);
      expect(Math.abs(anchor[2])).toBe(HALF);
      expect(dot(anchor, right)).toBeLessThan(dot(liftedBox(parksInMiddle, offset).min, right));
    }
    expect(boundaryLabelAnchor([], 0, [1, 0, 0])).toBeNull();
  });

  it("pushes overlapping labels apart bottom-up, keeping order and leaving a single label alone", () => {
    expect(separateExplodeLabels([400], 24)).toEqual([400]);
    expect(separateExplodeLabels([500, 300, 100], 24)).toEqual([500, 300, 100]);
    const pushed = separateExplodeLabels([500, 490, 488, 300], 24);
    expect(pushed).toEqual([500, 476, 452, 300]);
    for (let i = 1; i < pushed.length; i++) expect(pushed[i - 1] - pushed[i]).toBeGreaterThanOrEqual(24);
    expect(separateExplodeLabels([100, 100, 100], 24, 90)).toEqual([138, 114, 90]);
  });

  it("lays every label in one right-aligned column left of the left-most anchor, without overlaps", () => {
    const safe = { left: 338, top: 72, right: 1082, bottom: 816 };
    const anchors = [
      { x: 620, y: 700 },
      { x: 640, y: 690 },
      { x: 700, y: 688 },
      { x: 610, y: 560 },
      { x: 655, y: 300 },
      { x: 630, y: 120 },
    ];
    const layout = layoutExplodeLabels(anchors, 110, 20, safe);
    expect(layout.rightX).toBe(598);
    expect(layout.ys).toHaveLength(6);
    for (let i = 1; i < layout.ys.length; i++) expect(layout.ys[i - 1] - layout.ys[i]).toBeGreaterThanOrEqual(24);
    const rects = layout.ys.map((y) => ({ left: layout.rightX - 110, right: layout.rightX, top: y - 10, bottom: y + 10 }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const apart = rects[i].bottom <= rects[j].top || rects[j].bottom <= rects[i].top;
        expect(apart).toBe(true);
      }
    }
    expect(layoutExplodeLabels([{ x: 360, y: 400 }], 110, 20, safe).rightX).toBe(448);
    expect(layoutExplodeLabels([{ x: 1300, y: 400 }], 110, 20, safe).rightX).toBe(1082);
  });
});
