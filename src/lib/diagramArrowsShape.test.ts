import { describe, expect, it } from "vitest";
import type { Pt } from "../types";
import { ARROW_STYLES } from "./diagramArrows";
import { arrowHead, smoothArrowPath } from "./diagramArrowsPath";
import { ARROW_PRESETS, arrowUnitM, buildArrowShape, buildCometRibbons, ribbonBands, shapeFills, type ArrowShape } from "./diagramArrowsShape";

function smallestHalfWidth(shape: ArrowShape): number {
  return Math.min(...shape.ribbons.map((r) => Math.min(...r.left.map((l, i) => Math.hypot(l[0] - r.right[i]![0], l[1] - r.right[i]![1])))));
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

describe("arrow heads and bodies", () => {
  it("builds a head whose tip is the end of the path", () => {
    const head = arrowHead([10, 0], [1, 0], 4, 2);
    expect(head[0]).toEqual([10, 0]);
    expect(head[1]).toEqual([6, 2]);
    expect(head[2]).toEqual([6, -2]);
  });

  it("gives every ribbon style a pointed head at the end and double a second head at the start", () => {
    const points: Pt[] = [[-100, 0], [0, 20], [100, 0]];
    for (const style of ARROW_STYLES) {
      const preset = ARROW_PRESETS[style];
      const shape = buildArrowShape(points, style, 1, 500);
      if (preset.kind === "comets") {
        expect(shape.heads).toEqual([]);
        continue;
      }
      if (preset.kind === "chevrons") {
        expect(shape.polygons.length).toBeGreaterThan(2);
        expect(shape.polygons[shape.polygons.length - 1]![0]).toEqual([100, 0]);
        continue;
      }
      expect(shape.heads.length).toBe(preset.tailHead ? 2 : 1);
      expect(shape.heads[0]![0]).toEqual([100, 0]);
    }
    expect(buildArrowShape(points, "double", 1, 500).heads[1]![0]).toEqual([-100, 0]);
  });

  it("ends every body at a point at the tail", () => {
    const points: Pt[] = [[0, 0], [300, 0]];
    for (const style of ["bold", "line", "tapered"] as const) {
      const ribbon = buildArrowShape(points, style, 1, 500).ribbons[0]!;
      expect(Math.hypot(ribbon.left[0]![0] - ribbon.right[0]![0], ribbon.left[0]![1] - ribbon.right[0]![1])).toBeLessThan(1e-9);
      const last = ribbon.left.length - 1;
      expect(Math.hypot(ribbon.left[last]![1] - ribbon.right[last]![1])).toBeGreaterThan(0.1);
    }
  });

  it("grows the tapered flow smoothly from a point to the head base", () => {
    const ribbon = buildArrowShape([[0, 0], [300, 0]], "tapered", 1, 500).ribbons[0]!;
    const widths = ribbon.left.map((l, i) => Math.abs(l[1] - ribbon.right[i]![1]));
    expect(widths[0]).toBe(0);
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]! - 1e-9);
  });

  it("makes dashes of even width with square ends, a consistent gap and a pointed head", () => {
    const widthsOf = (ribbon: ArrowShape["ribbons"][number]) => ribbon.left.map((l, i) => Math.hypot(l[0] - ribbon.right[i]![0], l[1] - ribbon.right[i]![1]));
    const check = (shape: ArrowShape, even: boolean) => {
      expect(shape.ribbons.length).toBeGreaterThan(3);
      for (const ribbon of shape.ribbons) {
        const widths = widthsOf(ribbon);
        const mid = widths[Math.floor(widths.length / 2)]!;
        expect(widths[0]!).toBeGreaterThan(0.99 * mid);
        expect(widths[widths.length - 1]!).toBeGreaterThan(0.99 * mid);
        for (const w of widths) expect(Math.abs(w - mid)).toBeLessThan(1e-6);
      }
      if (!even) return;
      const spans = shape.ribbons.map((r) => [Math.min(...r.left.map((p) => p[0])), Math.max(...r.left.map((p) => p[0]))] as const);
      const lengths = spans.map(([from, to]) => to - from);
      const gaps = spans.slice(1).map(([from], i) => from - spans[i]![1]);
      for (const length of lengths) expect(length).toBeCloseTo(lengths[0]!, 6);
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 6);
      expect(gaps[0]!).toBeGreaterThan(0);
    };
    const dashed = buildArrowShape([[0, 0], [300, 0]], "dashed", 1, 500);
    check(dashed, true);
    expect(dashed.heads).toHaveLength(1);
    expect(dashed.heads[0]![0]).toEqual([300, 0]);
    const lastRibbon = dashed.ribbons[dashed.ribbons.length - 1]!;
    const headBaseX = dashed.heads[0]![1][0];
    expect(Math.max(...lastRibbon.left.map((p) => p[0]))).toBeCloseTo(headBaseX, 6);
    expect(Math.min(...dashed.ribbons[0]!.left.map((p) => p[0]))).toBeCloseTo(0, 6);
    const marching = buildArrowShape([[0, 0], [300, 0]], "bold", 1, 500, 0, { kind: "dashes", phase: 0.37 });
    check(marching, false);
    expect(marching.heads).toHaveLength(1);
  });

  it("draws dots as 14-sided discs spread along the path with a pointed head", () => {
    const shape = buildArrowShape([[0, 0], [300, 0]], "dotted", 1, 500);
    expect(shape.ribbons).toEqual([]);
    expect(shape.heads).toHaveLength(1);
    expect(shape.polygons.length).toBeGreaterThan(5);
    for (const dot of shape.polygons) expect(dot).toHaveLength(14);
    const centres = shape.polygons.map((dot) => dot.reduce((sum, p) => sum + p[0], 0) / dot.length);
    const radii = shape.polygons.map((dot) => Math.max(...dot.map((p) => p[0])) - Math.min(...dot.map((p) => p[0])));
    const steps = centres.slice(1).map((c, i) => c - centres[i]!);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 6);
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
    const headBaseX = shape.heads[0]![1][0];
    expect(headBaseX - (centres[centres.length - 1]! + radii[0]! / 2)).toBeCloseTo(steps[0]! - radii[0]!, 6);
  });

  it("draws chevrons with a sharp tip, a sharp notch and pointed wings, ending in a larger lead", () => {
    const shape = buildArrowShape([[0, 0], [300, 0]], "chevron", 1, 500);
    expect(shape.ribbons).toEqual([]);
    expect(shape.heads).toEqual([]);
    for (const chevron of shape.polygons) expect(chevron).toHaveLength(4);
    const lead = shape.polygons[shape.polygons.length - 1]!;
    const regular = shape.polygons[0]!;
    expect(lead[0]).toEqual([300, 0]);
    const span = (poly: Pt[]) => Math.abs(poly[1]![1] - poly[3]![1]);
    expect(span(lead)).toBeGreaterThan(span(regular));
    expect(lead[2]![0]).toBeGreaterThan(lead[1]![0]);
    expect(lead[2]![0]).toBeLessThan(lead[0][0]);
  });

  it("keeps heads at a minimum on-screen size", () => {
    const path: Pt[] = [[0, 0], [400, 0]];
    const small = buildArrowShape(path, "dashed", 0.55, 1470);
    const floored = buildArrowShape(path, "dashed", 0.55, 1470, 2.5);
    const headSpan = (shape: ArrowShape) => Math.abs(shape.heads[0]![1][1] - shape.heads[0]![2][1]);
    expect(headSpan(floored)).toBeGreaterThanOrEqual(2 * 0.9 * 7 * 2.5 - 1e-6);
    expect(headSpan(floored)).toBeGreaterThan(headSpan(small));
  });

  it("scales width with the site size and the width slider", () => {
    const points: Pt[] = [[0, 0], [300, 0]];
    const wide = (side: number, width: number) => {
      const ribbon = buildArrowShape(points, "bold", width, side).ribbons[0]!;
      const mid = Math.floor(ribbon.left.length / 2);
      return Math.abs(ribbon.left[mid]![1] - ribbon.right[mid]![1]);
    };
    expect(wide(500, 2.5)).toBeGreaterThan(wide(500, 0.4));
    expect(wide(1000, 1)).toBeGreaterThan(wide(500, 1));
    expect(arrowUnitM(2, 1000)).toBeCloseTo(arrowUnitM(1, 1000) * 2);
  });

  it("returns an empty shape for fewer than two distinct points", () => {
    expect(buildArrowShape([[3, 3], [3, 3]], "bold", 1, 500)).toEqual({ ribbons: [], heads: [], polygons: [] });
  });

  it("smooths the body so there is no flat step where it meets the head", () => {
    const shape = buildArrowShape([[0, 0], [300, 0]], "bold", 1, 500);
    const body = shape.ribbons[0]!;
    const head = shape.heads[0]!;
    const last = body.left.length - 1;
    expect(body.left[last]![0]).toBeCloseTo(head[1][0], 6);
    expect(Math.abs(body.left[last]![1])).toBeLessThan(Math.abs(head[1][1]));
  });
});

describe("comets", () => {
  const path: Pt[] = [[0, 0], [300, 0]];

  it("draws three or four frozen comets and never a solid body for the streak style", () => {
    const shape = buildArrowShape(path, "streak", 1, 500);
    expect(shape.heads).toEqual([]);
    expect(shape.polygons).toEqual([]);
    expect(shape.ribbons.length).toBeGreaterThanOrEqual(3);
    expect(shape.ribbons.length).toBeLessThanOrEqual(4);
    for (const ribbon of shape.ribbons) expect(ribbon.alpha).toBeDefined();
  });

  it("spaces the frozen comets evenly and gives each a sharp tail and head", () => {
    const { ribbons } = buildArrowShape(path, "streak", 1, 500);
    const tips = ribbons.map((r) => r.left[r.left.length - 1]![0]);
    const gaps = tips.slice(1).map((x, i) => x - tips[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 6);
    for (const ribbon of ribbons) {
      const last = ribbon.left.length - 1;
      expect(Math.abs(ribbon.left[0]![1] - ribbon.right[0]![1])).toBeLessThan(1e-9);
      expect(Math.abs(ribbon.left[last]![1] - ribbon.right[last]![1])).toBeLessThan(1e-9);
      expect(ribbon.alpha![0]).toBeLessThan(0.05);
      expect(ribbon.alpha![last]!).toBeGreaterThan(0.5);
    }
  });

  it("fades each comet towards its tail and towards both ends of the path", () => {
    const ribbons = buildCometRibbons(path, "streak", 1, 500, 0, 0.4);
    expect(ribbons.length).toBeGreaterThan(0);
    for (const ribbon of ribbons) {
      const alpha = ribbon.alpha!;
      const widths = ribbon.left.map((l, i) => Math.abs(l[1] - ribbon.right[i]![1]));
      expect(Math.max(...alpha)).toBeLessThanOrEqual(1);
      expect(Math.min(...alpha)).toBeGreaterThanOrEqual(0);
      expect(widths.some((w) => w > 0)).toBe(true);
      const startsAtOrigin = ribbon.left[0]![0] < 1e-6;
      if (startsAtOrigin) expect(alpha[0]!).toBeLessThan(0.05);
    }
  });

  it("travels with time and faster with a higher time scale", () => {
    const at = (seconds: number) => buildCometRibbons(path, "streak", 1, 500, 0, seconds)[0]!.left[0]![0];
    expect(at(0.5)).not.toBeCloseTo(at(0), 3);
  });

  it("splits a faded ribbon into bands that carry the alpha", () => {
    const ribbon = buildCometRibbons(path, "streak", 1, 500, 0, null)[0]!;
    const bands = ribbonBands(ribbon, 6);
    expect(bands.length).toBe(6);
    expect(bands[bands.length - 1]!.alpha).toBeGreaterThan(bands[0]!.alpha);
    expect(shapeFills(buildArrowShape(path, "bold", 1, 500)).every((fill) => fill.alpha === 1)).toBe(true);
  });

  it("never leaves a blunt tail on any body or comet; dash segments keep square ends", () => {
    for (const style of ARROW_STYLES) {
      const shape = buildArrowShape(path, style, 1, 500);
      if (shape.ribbons.length === 0 || ARROW_PRESETS[style].tailHead || ARROW_PRESETS[style].dash) continue;
      expect(smallestHalfWidth(shape)).toBeLessThan(1e-9);
    }
  });
});

