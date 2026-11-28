// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import type { Pt } from "../types";
import type { DiagramArrow } from "./diagramArrows";
import { arrowUnitM, buildArrowShape, buildCometRibbons } from "./diagramArrowsShape";
import { markArrowEditor, withArrowEditorHidden } from "./diagramArrows3d";
import {
  DASH_PERIOD_S,
  DRAW_ON_GROW_S,
  DRAW_ON_HOLD_S,
  DRAW_ON_LOOP_S,
  animatedArrows,
  arrowKeepsBodyWhileLive,
  arrowClockSeconds,
  arrowMotionAt,
  dashPhase,
  drawOnProgress,
  liveArrowShape,
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
  width: 1,
  speed: 1,
  animation,
});
const build = (style: DiagramArrow["style"], motion = null as Parameters<typeof buildArrowShape>[5]) =>
  buildArrowShape(POINTS, style, 1, 1000, 0, motion);
const ribbonLength = (shape: ReturnType<typeof build>) => shape.ribbons[0]!.left[shape.ribbons[0]!.left.length - 1]![0];

const rounded = (value: unknown) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v)));

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

  it("keeps the tapered flow relative to the whole arrow while growing, ending in a point", () => {
    const half = build("tapered", { kind: "draw-on", progress: 0.5 }).ribbons[0]!;
    const full = build("tapered").ribbons[0]!;
    const width = (r: typeof half, i: number) => Math.hypot(r.left[i]![0] - r.right[i]![0], r.left[i]![1] - r.right[i]![1]);
    expect(width(half, 0)).toBeCloseTo(0, 6);
    expect(width(half, half.left.length - 1)).toBeCloseTo(0, 6);
    expect(width(full, Math.floor(full.left.length / 2))).toBeGreaterThan(width(half, Math.floor(half.left.length / 2)) * 0.5);
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
    const period = arrowUnitM(1, 1000) * 4;
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

describe("flowing comets", () => {
  it("moves comets tail to head and loops", () => {
    const head = (seconds: number) => {
      const ribbon = buildCometRibbons(POINTS, "streak", 1, 1000, 0, seconds).find((r) => r.left[0]![0] > 1)!;
      return ribbon.left[ribbon.left.length - 1]![0];
    };
    expect(head(0.2)).toBeGreaterThan(head(0.1));
  });

  it("tapers every comet tail to a point", () => {
    for (const ribbon of buildCometRibbons(POINTS, "streak", 1, 1000, 0, null)) {
      const first = Math.hypot(ribbon.left[0]![0] - ribbon.right[0]![0], ribbon.left[0]![1] - ribbon.right[0]![1]);
      const mid = Math.hypot(ribbon.left[5]![0] - ribbon.right[5]![0], ribbon.left[5]![1] - ribbon.right[5]![1]);
      expect(first).toBeLessThan(mid * 0.1);
    }
  });

  it("keeps every comet on the body and fades it out at both ends", () => {
    for (const t of [0, 0.37, 1.2, 5.5]) {
      for (const ribbon of buildCometRibbons(POINTS, "streak", 1, 1000, 0, t)) {
        for (const p of ribbon.left) {
          expect(p[0]).toBeGreaterThanOrEqual(-1);
          expect(p[0]).toBeLessThanOrEqual(201);
        }
        const nearEnd = ribbon.left.map((p, i) => ({ x: p[0], a: ribbon.alpha![i]! }));
        for (const sample of nearEnd) if (sample.x < 1 || sample.x > 199) expect(sample.a).toBeLessThan(0.1);
      }
    }
  });

  it("draws comets over a lightened static body for non-streak styles only", () => {
    const over = liveArrowShape({ ...arrow("streaks"), speed: 1 }, 1000, 0, 0.3);
    expect(over.body).toEqual(build("bold"));
    expect(over.comets.length).toBeGreaterThan(0);
    expect(over.lightComets).toBe(true);
    const own = liveArrowShape({ ...arrow("streaks", "streak"), speed: 1 }, 1000, 0, 0.3);
    expect(own.body).toEqual({ ribbons: [], heads: [], polygons: [] });
    expect(own.comets.length).toBeGreaterThan(0);
    expect(own.lightComets).toBe(false);
  });

  it("travels comets for the streak style whichever animation is set, and never draws a solid body", () => {
    for (const animation of ["streaks", "draw-on", "dashes"] as const) {
      const live = liveArrowShape(arrow(animation, "streak"), 1000, 0, 0.3);
      expect(live.body.ribbons).toEqual([]);
      expect(live.comets.length).toBeGreaterThan(0);
    }
  });

  it("applies the per-arrow speed to every animation", () => {
    const at = (animation: DiagramArrow["animation"], speed: number, seconds: number, style: DiagramArrow["style"] = "bold") =>
      liveArrowShape({ ...arrow(animation, style), speed }, 1000, 0, seconds);
    expect(rounded(at("draw-on", 2, 0.4).body)).toEqual(rounded(at("draw-on", 1, 0.8).body));
    expect(rounded(at("dashes", 3, 0.2).body)).toEqual(rounded(at("dashes", 1, 0.6).body));
    expect(rounded(at("streaks", 0.5, 0.8, "streak").comets)).toEqual(rounded(at("streaks", 1, 0.4, "streak").comets));
    expect(at("draw-on", 0.5, 0.8).body).not.toEqual(at("draw-on", 1, 0.8).body);
  });

  it("keeps the static body on screen only when comets travel over a non-streak arrow", () => {
    expect(arrowKeepsBodyWhileLive({ style: "bold", animation: "streaks" })).toBe(true);
    expect(arrowKeepsBodyWhileLive({ style: "streak", animation: "streaks" })).toBe(false);
    expect(arrowKeepsBodyWhileLive({ style: "bold", animation: "draw-on" })).toBe(false);
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
      const still = liveArrowShape(arrow(animation), 1000, 0, null);
      expect(still.body).toEqual(build("bold"));
      expect(still.comets).toEqual([]);
    }
  });

  it("freezes the streak style as evenly spaced comets with no solid body", () => {
    for (const animation of ["none", "streaks", "draw-on", "dashes"] as const) {
      const still = liveArrowShape(arrow(animation, "streak"), 1000, 0, null);
      expect(still.comets).toEqual([]);
      expect(still.body.ribbons.length).toBeGreaterThanOrEqual(3);
      expect(still.body.ribbons.length).toBeLessThanOrEqual(4);
      expect(still.body.heads).toEqual([]);
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
