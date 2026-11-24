import { describe, expect, it } from "vitest";
import type { DiagramArrow } from "./diagramArrows";
import { drawPlanArrows } from "./diagramArrowsPlanDraw";

const arrow = (over: Partial<DiagramArrow> = {}): DiagramArrow => ({
  id: "a",
  points: [[0, 0], [300, 0]],
  style: "bold",
  colour: "blue",
  width: "m",
  heightM: 20,
  label: "",
  animation: "none",
  showIn3d: true,
  showInDrawing: true,
  ...over,
});

function recorder() {
  const calls: string[] = [];
  const moves: [number, number][] = [];
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    setTransform: (...m: number[]) => calls.push(`T${m.join(",")}`),
    beginPath: () => calls.push("begin"),
    moveTo: (x: number, y: number) => moves.push([x, y]),
    lineTo: () => {},
    closePath: () => {},
    fill: () => calls.push("fill"),
    globalAlpha: 1,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, moves };
}

const T = { ox: 100, oy: 200, exX: 2, exY: 0, enX: 0, enY: -2 };

describe("drawPlanArrows", () => {
  it("fills the static arrow shape in plan world coordinates through the camera transform", () => {
    const { ctx, calls, moves } = recorder();
    drawPlanArrows(ctx, [arrow()], T, 2, 1470, new Set(), 0);
    expect(calls).toContain("T4,0,0,-4,200,400");
    expect(calls.filter((c) => c === "fill")).toHaveLength(1);
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...moves.map(([e]) => e))).toBeCloseTo(300, 0);
  });

  it("adds a streak layer for animated streak arrows and draws nothing for no arrows", () => {
    const streaks = arrow({ animation: "streaks", style: "streak" });
    const live = recorder();
    drawPlanArrows(live.ctx, [streaks], T, 1, 1470, new Set([streaks]), 0.5);
    expect(live.calls.filter((c) => c === "fill").length).toBeGreaterThanOrEqual(2);
    const none = recorder();
    drawPlanArrows(none.ctx, [], T, 1, 1470, new Set(), 0);
    expect(none.calls.filter((c) => c === "fill")).toHaveLength(0);
  });

  it("draw-on animation shortens the drawn body", () => {
    const grow = arrow({ animation: "draw-on" });
    const early = recorder();
    drawPlanArrows(early.ctx, [grow], T, 1, 1470, new Set([grow]), 0.2);
    const full = recorder();
    drawPlanArrows(full.ctx, [arrow()], T, 1, 1470, new Set(), 0);
    expect(Math.max(...early.moves.map(([e]) => e))).toBeLessThan(Math.max(...full.moves.map(([e]) => e)));
  });
});
