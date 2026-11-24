// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import type { Pt } from "../types";
import { arrowUnitM, buildArrowShape, buildStreakRibbons, pathLength, streakSpans, type DiagramArrow } from "./diagramArrows";
import { markArrowEditor, withArrowEditorHidden } from "./diagramArrows3d";
import {
  DASH_PERIOD_S,
  DRAW_ON_GROW_S,
  DRAW_ON_HOLD_S,
  DRAW_ON_LOOP_S,
  animatedArrowShape,
  animatedArrows,
  arrowClockSeconds,
  arrowMotionAt,
  dashPhase,
  drawOnProgress,
  setArrowClockSource,
} from "./diagramArrowsMotion";
import { markExportOnly, markScreenOnly, withScreenOnlyHidden } from "./screenOnly";

const POINTS: Pt[] = [
  [0, 0],
  [200, 0],
];
const arrow = (animation: DiagramArrow["animation"], style: DiagramArrow["style"] = "bold") => ({
  points: POINTS,
  style,
  width: "m" as const,
  animation,
});
const build = (style: DiagramArrow["style"], motion = null as Parameters<typeof buildArrowShape>[5]) =>
  buildArrowShape(POINTS, style, "m", 1000, 0, motion);
const ribbonLength = (shape: ReturnType<typeof build>) => pathLength(shape.ribbons[0]!.left);

afterEach(() => setArrowClockSource(null));

describe("draw-on timing", () => {
  it("grows over 1.6 s, holds 0.8 s, then repeats", () => {
    expect(drawOnProgress(0)).toBe(0);
    expect(drawOnProgress(DRAW_ON_GROW_S / 2)).toBeCloseTo(0.5, 6);
    expect(drawOnProgress(DRAW_ON_GROW_S)).toBeCloseTo(1, 9);
    expect(drawOnProgress(DRAW_ON_GROW_S + DRAW_ON_HOLD_S / 2)).toBe(1);
    expect(drawOnProgress(DRAW_ON_LOOP_S - 0.001)).toBe(1);
    expect(drawOnProgress(DRAW_ON_LOOP_S)).toBe(0);
    expect(drawOnProgress(DRAW_ON_LOOP_S + 0.4)).toBeCloseTo(0.25, 6);
  });

  it("shows no head until the body reaches the tip", () => {
    expect(build("bold", { kind: "draw-on", progress: 0 }).ribbons).toHaveLength(0);
    const growing = build("bold", { kind: "draw-on", progress: 0.5 });
    expect(growing.heads).toHaveLength(0);
    expect(ribbonLength(growing)).toBeCloseTo(ribbonLength(build("bold")) / 2, 3);
    const done = build("bold", { kind: "draw-on", progress: 1 });
    expect(done).toEqual(build("bold"));
    expect(done.heads).toHaveLength(1);
  });

  it("keeps the tail head of a double arrow while growing", () => {
    expect(build("double", { kind: "draw-on", progress: 0.4 }).heads).toHaveLength(1);
  });

  it("keeps the streak taper relative to the whole arrow while growing", () => {
    const half = build("streak", { kind: "draw-on", progress: 0.5 }).ribbons[0]!;
    const full = build("streak").ribbons[0]!;
    const width = (r: typeof half, i: number) => Math.hypot(r.left[i]![0] - r.right[i]![0], r.left[i]![1] - r.right[i]![1]);
    expect(width(half, half.left.length - 1)).toBeLessThan(width(full, full.left.length - 1));
    expect(width(half, 0)).toBeCloseTo(width(full, 0), 6);
  });
});

describe("marching dashes", () => {
  it("wraps the dash phase every period", () => {
    expect(dashPhase(0)).toBe(0);
    expect(dashPhase(DASH_PERIOD_S / 4)).toBeCloseTo(0.25, 6);
    expect(dashPhase(DASH_PERIOD_S)).toBeCloseTo(0, 6);
    expect(dashPhase(-DASH_PERIOD_S / 4)).toBeCloseTo(0.75, 6);
  });

  it("cuts a solid style into dashes and keeps the head", () => {
    const shape = build("bold", { kind: "dashes", phase: 0 });
    expect(shape.ribbons.length).toBeGreaterThan(3);
    expect(shape.heads).toHaveLength(1);
  });

  it("moves every dash towards the head as the phase grows", () => {
    const starts = (phase: number) => build("bold", { kind: "dashes", phase }).ribbons.map((r) => r.left[0]![0]);
    const period = arrowUnitM("m", 1000) * 4;
    const before = starts(0);
    const after = starts(0.25);
    for (const start of before.filter((x) => x > 0 && x < 150)) {
      expect(after.some((x) => Math.abs(x - (start + period * 0.25)) < 1e-6)).toBe(true);
    }
  });

  it("marches the dashes of the Dashed style and returns to the start after one period", () => {
    const base = build("dashed");
    expect(build("dashed", { kind: "dashes", phase: 0 })).toEqual(base);
    expect(build("dashed", { kind: "dashes", phase: 0.4 })).not.toEqual(base);
  });
});

describe("flowing streaks", () => {
  const unit = 11;
  it("moves streaks tail to head and loops", () => {
    const early = streakSpans(0.1, 300, unit);
    const later = streakSpans(0.2, 300, unit);
    expect(later[0]!.to).toBeGreaterThan(early[0]!.to);
    const loopS = (unit * 22) / (unit * 9);
    const now = streakSpans(0.3, 300, unit);
    const again = streakSpans(0.3 + loopS, 300, unit);
    expect(again).toHaveLength(now.length);
    again.forEach((span, i) => {
      expect(span.from).toBeCloseTo(now[i]!.from, 6);
      expect(span.to).toBeCloseTo(now[i]!.to, 6);
    });
  });

  it("keeps every span on the body", () => {
    for (const t of [0, 0.37, 1.2, 5.5]) {
      for (const span of streakSpans(t, 300, unit)) {
        expect(span.from).toBeGreaterThanOrEqual(0);
        expect(span.to).toBeLessThanOrEqual(300);
        expect(span.to).toBeGreaterThan(span.from);
      }
    }
  });

  it("builds tapered ribbons that differ over time and sit on the path", () => {
    const a = buildStreakRibbons(POINTS, "bold", "m", 1000, 0, 0.1);
    const b = buildStreakRibbons(POINTS, "bold", "m", 1000, 0, 0.4);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toEqual(b);
    for (const ribbon of a) for (const p of [...ribbon.left, ...ribbon.right]) expect(p[0]).toBeGreaterThanOrEqual(0);
    const full = a.find((r) => r.left.length > 1)!;
    const w = (i: number) => Math.hypot(full.left[i]![0] - full.right[i]![0], full.left[i]![1] - full.right[i]![1]);
    expect(w(full.left.length - 1)).toBeGreaterThan(w(0));
  });
});

describe("what animates", () => {
  it("returns nothing for none, so the scene stays idle", () => {
    expect(animatedArrows([arrow("none"), arrow("none")], false)).toEqual([]);
  });

  it("lists animated arrows and drops them all under reduced motion", () => {
    const list = [arrow("none"), arrow("streaks"), arrow("draw-on"), arrow("dashes")];
    expect(animatedArrows(list, false)).toHaveLength(3);
    expect(animatedArrows(list, true)).toEqual([]);
  });

  it("maps each animation to its motion", () => {
    expect(arrowMotionAt("none", 1)).toBeNull();
    expect(arrowMotionAt("streaks", 1)).toBeNull();
    expect(arrowMotionAt("draw-on", 0.8)).toMatchObject({ kind: "draw-on" });
    expect((arrowMotionAt("draw-on", 0.8) as { progress: number }).progress).toBeCloseTo(0.5, 9);
    expect(arrowMotionAt("dashes", 0)).toEqual({ kind: "dashes", phase: 0 });
  });

  it("runs one shared clock from the first read", () => {
    let now = 100;
    setArrowClockSource(() => now);
    expect(arrowClockSeconds()).toBe(0);
    now = 101.5;
    expect(arrowClockSeconds()).toBe(1.5);
  });
});

describe("static exports", () => {
  it("renders the full arrow when no clock time is given, whatever the animation", () => {
    for (const animation of ["none", "streaks", "draw-on", "dashes"] as const) {
      const still = animatedArrowShape(arrow(animation), 1000, 0, null);
      expect(still.body).toEqual(build("bold"));
      expect(still.streaks).toEqual([]);
    }
  });

  it("shows the full mesh and hides the live mesh while a 3D export runs", () => {
    const scene = new THREE.Group();
    const full = new THREE.Mesh();
    full.visible = false;
    markExportOnly(full);
    const live = new THREE.Mesh();
    markScreenOnly(live);
    markArrowEditor(live);
    scene.add(full, live);
    for (const run of [withScreenOnlyHidden, withArrowEditorHidden]) {
      let during: [boolean, boolean] = [false, true];
      run(scene, () => {
        during = [full.visible, live.visible];
      });
      expect(during).toEqual([true, false]);
      expect([full.visible, live.visible]).toEqual([false, true]);
    }
  });
});
