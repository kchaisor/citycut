import { describe, expect, it } from "vitest";
import {
  ARROW_STYLES,
  DEFAULT_ARROW,
  arrowsForCut,
  hitArrow,
  parseDiagramArrow,
  parseDiagramArrows,
  parseDiagramArrowsStore,
  visibleIn3d,
  visibleInDrawing,
  readDiagramArrowsStore,
  withCutArrows,
  writeDiagramArrowsStore,
  emptyDiagramArrowsStore,
  DIAGRAM_ARROWS_STORAGE_KEY,
  type DiagramArrow,
} from "./diagramArrows";
import { arrowMidpoint, dedupePoints, nearestPointIndex, pathLength } from "./diagramArrowsPath";

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
  width: 1.4,
  speed: 2,
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

describe("arrow styles", () => {
  it("offers the eight styles in picker order", () => {
    expect([...ARROW_STYLES]).toEqual(["streak", "tapered", "bold", "line", "dashed", "dotted", "chevron", "double"]);
  });

  it("finds the midpoint near the middle of the path", () => {
    expect(arrowMidpoint([[0, 0], [100, 0]])[0]).toBeCloseTo(50);
  });
});

describe("arrow visibility", () => {
  const both = ARROW;
  const only3d: DiagramArrow = { ...ARROW, id: "b", showInDrawing: false };
  const onlyDrawing: DiagramArrow = { ...ARROW, id: "c", showIn3d: false };
  const neither: DiagramArrow = { ...ARROW, id: "d", showIn3d: false, showInDrawing: false };
  const all = [both, only3d, onlyDrawing, neither];

  it("filters 3D, Plan and PNG arrows by Show in 3D alone", () => {
    expect(visibleIn3d(all).map((arrow) => arrow.id)).toEqual([both.id, "b"]);
  });

  it("filters Drawing, SVG, AI and 3dm arrows by Show in Drawing alone", () => {
    expect(visibleInDrawing(all).map((arrow) => arrow.id)).toEqual([both.id, "c"]);
  });

  it("keeps both on for stored arrows without the flags and reads explicit false", () => {
    const base = { id: "x", points: [[0, 0], [5, 5]] };
    expect(parseDiagramArrow(base)).toMatchObject({ showIn3d: true, showInDrawing: true });
    expect(parseDiagramArrow({ ...base, showIn3d: false, showInDrawing: false })).toMatchObject({ showIn3d: false, showInDrawing: false });
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
    const loose = parseDiagramArrow({ id: "x", points: [[0, 0], [5, 5]], style: "wavy", colour: 4, width: "xl", heightM: "high", speed: "fast", animation: "spin" });
    expect(loose).toMatchObject({ ...DEFAULT_ARROW, id: "x" });
    expect(parseDiagramArrow({ id: "x", points: [[0, 0]] })).toBeNull();
    expect(parseDiagramArrow({ id: "x", points: [[0, 0], [0, 0]] })).toBeNull();
    expect(parseDiagramArrow({ id: "", points: [[0, 0], [1, 1]] })).toBeNull();
    expect(parseDiagramArrow({ id: "x", points: [[0, "a"], [1, 1]] })).toBeNull();
    expect(parseDiagramArrow(null)).toBeNull();
  });

  it("clamps height, width and speed and drops duplicate ids", () => {
    const extreme = parseDiagramArrow({ ...ARROW, heightM: 99999, width: 40, speed: 0 })!;
    expect(extreme.heightM).toBe(500);
    expect(extreme.width).toBe(2.5);
    expect(extreme.speed).toBe(0.25);
    expect(parseDiagramArrows([ARROW, ARROW, { nope: true }])).toEqual([ARROW]);
    expect(parseDiagramArrows("nope")).toEqual([]);
  });

  it("maps the old S, M and L widths and defaults a missing speed", () => {
    const legacy = (width: string) => parseDiagramArrow({ id: "x", points: [[0, 0], [5, 5]], width })!;
    expect(legacy("s").width).toBe(0.55);
    expect(legacy("m").width).toBe(1);
    expect(legacy("l").width).toBe(1.65);
    expect(legacy("m").speed).toBe(1);
  });

  it("ignores a stored label silently", () => {
    const old = parseDiagramArrow({ ...ARROW, label: "Prevailing flow" })!;
    expect(old).toEqual(ARROW);
    expect("label" in old).toBe(false);
    const store = { version: 1, byCut: { c: [{ ...ARROW, label: "Old", width: "l" }] } };
    expect(arrowsForCut(parseDiagramArrowsStore(JSON.stringify(store)), "c")).toEqual([{ ...ARROW, width: 1.65 }]);
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
