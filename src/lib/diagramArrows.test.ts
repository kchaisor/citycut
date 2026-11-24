import { describe, expect, it } from "vitest";
import type { Pt } from "../types";
import {
  ARROW_PRESETS,
  ARROW_STYLES,
  DEFAULT_ARROW,
  arrowHead,
  arrowLabelAnchor,
  arrowsForCut,
  buildArrowShape,
  dedupePoints,
  hitArrow,
  nearestPointIndex,
  parseDiagramArrow,
  parseDiagramArrows,
  parseDiagramArrowsStore,
  pathLength,
  readDiagramArrowsStore,
  smoothArrowPath,
  withCutArrows,
  writeDiagramArrowsStore,
  emptyDiagramArrowsStore,
  DIAGRAM_ARROWS_STORAGE_KEY,
  type DiagramArrow,
} from "./diagramArrows";

const ARROW: DiagramArrow = {
  id: "a1",
  points: [
    [0, 0],
    [50, 30],
    [100, -20],
  ],
  ...DEFAULT_ARROW,
  style: "dashed",
  colour: "red",
  label: "Prevailing flow",
  heightM: 35,
};

function memoryStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("smoothArrowPath", () => {
  const controls: Pt[] = [
    [0, 0],
    [40, 25],
    [80, -10],
    [120, 30],
  ];

  it("passes through every control point", () => {
    const path = smoothArrowPath(controls);
    for (const control of controls) {
      expect(path.some((p) => Math.hypot(p[0] - control[0], p[1] - control[1]) < 1e-6)).toBe(true);
    }
    expect(path[0]).toEqual(controls[0]);
    expect(path[path.length - 1]).toEqual(controls[3]);
  });

  it("is smooth: consecutive samples turn gently", () => {
    const path = smoothArrowPath(controls, 20);
    for (let i = 2; i < path.length; i += 1) {
      const a = [path[i - 1]![0] - path[i - 2]![0], path[i - 1]![1] - path[i - 2]![1]];
      const b = [path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]];
      const cos = (a[0]! * b[0]! + a[1]! * b[1]!) / (Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!));
      expect(cos).toBeGreaterThan(0.8);
    }
  });

  it("returns a straight segment for two points", () => {
    expect(smoothArrowPath([[0, 0], [10, 0]])).toEqual([[0, 0], [10, 0]]);
  });

  it("ignores duplicate points and short input", () => {
    expect(smoothArrowPath([[1, 1], [1, 1], [1, 1]])).toEqual([[1, 1]]);
    expect(smoothArrowPath([])).toEqual([]);
    const path = smoothArrowPath([[0, 0], [0, 0], [30, 0], [30, 0], [60, 20]]);
    expect(path.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
    expect(path[path.length - 1]).toEqual([60, 20]);
  });

  it("does not overshoot wildly on uneven spacing", () => {
    const path = smoothArrowPath([[0, 0], [1, 0], [100, 0]]);
    expect(Math.max(...path.map((p) => Math.abs(p[1])))).toBeLessThan(1);
  });
});

describe("arrow shapes", () => {
  it("builds a head whose tip is the end of the path", () => {
    const head = arrowHead([10, 0], [1, 0], 4, 2);
    expect(head[0]).toEqual([10, 0]);
    expect(head[1]).toEqual([6, 2]);
    expect(head[2]).toEqual([6, -2]);
  });

  it("gives every style a head at the end and double a second head at the start", () => {
    const points: Pt[] = [[-100, 0], [0, 20], [100, 0]];
    for (const style of ARROW_STYLES) {
      const shape = buildArrowShape(points, style, "m", 500);
      expect(shape.heads.length).toBe(ARROW_PRESETS[style].tailHead ? 2 : 1);
      expect(shape.heads[0]![0]).toEqual([100, 0]);
      expect(shape.ribbons.length).toBeGreaterThan(0);
    }
    expect(buildArrowShape(points, "double", "m", 500).heads[1]![0]).toEqual([-100, 0]);
  });

  it("splits a dashed arrow into several dashes and a solid one into one body", () => {
    const points: Pt[] = [[0, 0], [300, 0]];
    expect(buildArrowShape(points, "dashed", "m", 500).ribbons.length).toBeGreaterThan(3);
    expect(buildArrowShape(points, "bold", "m", 500).ribbons.length).toBe(1);
  });

  it("tapers the streak towards the tail", () => {
    const { ribbons } = buildArrowShape([[0, 0], [200, 0]], "streak", "l", 500);
    const ribbon = ribbons[0]!;
    const tail = Math.abs(ribbon.left[0]![1] - ribbon.right[0]![1]);
    const front = Math.abs(ribbon.left[ribbon.left.length - 1]![1] - ribbon.right[ribbon.right.length - 1]![1]);
    expect(front).toBeGreaterThan(tail * 3);
  });

  it("scales width with the site size and the width setting", () => {
    const points: Pt[] = [[0, 0], [300, 0]];
    const half = (side: number, width: "s" | "l") => {
      const ribbon = buildArrowShape(points, "bold", width, side).ribbons[0]!;
      return Math.abs(ribbon.left[0]![1] - ribbon.right[0]![1]);
    };
    expect(half(500, "l")).toBeGreaterThan(half(500, "s"));
    expect(half(1000, "s")).toBeGreaterThan(half(500, "s"));
  });

  it("returns an empty shape for fewer than two distinct points", () => {
    expect(buildArrowShape([[3, 3], [3, 3]], "bold", "m", 500)).toEqual({ ribbons: [], heads: [] });
  });

  it("finds the label anchor near the middle of the path", () => {
    const anchor = arrowLabelAnchor([[0, 0], [100, 0]]);
    expect(anchor[0]).toBeCloseTo(50);
  });
});

describe("hit testing", () => {
  it("hits an arrow near its curve and misses far away", () => {
    expect(hitArrow([ARROW], [50, 30], 4)).toBe("a1");
    expect(hitArrow([ARROW], [50, 200], 4)).toBeNull();
  });

  it("finds the nearest control point within tolerance", () => {
    expect(nearestPointIndex(ARROW.points, [52, 31], 5)).toBe(1);
    expect(nearestPointIndex(ARROW.points, [70, 90], 5)).toBeNull();
  });

  it("measures path length", () => {
    expect(pathLength([[0, 0], [3, 4]])).toBe(5);
    expect(dedupePoints([[0, 0], [0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });
});

describe("parse and store", () => {
  it("round-trips an arrow through JSON", () => {
    expect(parseDiagramArrow(JSON.parse(JSON.stringify(ARROW)))).toEqual(ARROW);
  });

  it("falls back to defaults for bad fields and drops bad arrows", () => {
    const loose = parseDiagramArrow({ id: "x", points: [[0, 0], [5, 5]], style: "wavy", colour: 4, width: "xl", heightM: "high", label: 7, animation: "spin" });
    expect(loose).toMatchObject({ ...DEFAULT_ARROW, id: "x", label: "" });
    expect(parseDiagramArrow({ id: "x", points: [[0, 0]] })).toBeNull();
    expect(parseDiagramArrow({ id: "x", points: [[0, 0], [0, 0]] })).toBeNull();
    expect(parseDiagramArrow({ id: "", points: [[0, 0], [1, 1]] })).toBeNull();
    expect(parseDiagramArrow({ id: "x", points: [[0, "a"], [1, 1]] })).toBeNull();
    expect(parseDiagramArrow(null)).toBeNull();
  });

  it("clamps height and label length and drops duplicate ids", () => {
    const tall = parseDiagramArrow({ ...ARROW, heightM: 99999, label: "x".repeat(200) })!;
    expect(tall.heightM).toBe(500);
    expect(tall.label.length).toBe(60);
    expect(parseDiagramArrows([ARROW, ARROW, { nope: true }])).toEqual([ARROW]);
    expect(parseDiagramArrows("nope")).toEqual([]);
  });

  it("round-trips the per-site store and keeps sites apart", () => {
    const storage = memoryStorage();
    const other: DiagramArrow = { ...ARROW, id: "a2", showIn3d: false };
    let store = withCutArrows(emptyDiagramArrowsStore(), "cut-a", [ARROW]);
    store = withCutArrows(store, "cut-b", [other]);
    expect(writeDiagramArrowsStore(storage, store)).toBe(true);
    const reread = readDiagramArrowsStore(storage);
    expect(arrowsForCut(reread, "cut-a")).toEqual([ARROW]);
    expect(arrowsForCut(reread, "cut-b")).toEqual([other]);
    expect(arrowsForCut(reread, "cut-c")).toEqual([]);
    expect(withCutArrows(reread, "cut-a", []).byCut["cut-a"]).toBeUndefined();
  });

  it("recovers from corrupt storage", () => {
    expect(parseDiagramArrowsStore("{not json")).toEqual(emptyDiagramArrowsStore());
    expect(parseDiagramArrowsStore(JSON.stringify({ version: 9, byCut: {} }))).toEqual(emptyDiagramArrowsStore());
    expect(parseDiagramArrowsStore(null)).toEqual(emptyDiagramArrowsStore());
    const storage = memoryStorage();
    storage.setItem(DIAGRAM_ARROWS_STORAGE_KEY, JSON.stringify({ version: 1, byCut: { c: [ARROW, { id: "bad" }] } }));
    expect(arrowsForCut(readDiagramArrowsStore(storage), "c")).toEqual([ARROW]);
  });
});
