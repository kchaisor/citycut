import { describe, expect, it } from "vitest";
import { WalkPlayback } from "./walkPlayback";
import { CELL_BLOCKED, CELL_VISIBLE, type HeightGrid } from "./viewshed";
import type { Pt } from "../types";

function setup() {
  const grid: HeightGrid = {
    cols: 4, rows: 1, x0: 0, y0: 0, cell: 10,
    ground: new Float32Array(4), surface: new Float32Array(4), covered: new Uint8Array(4),
  };
  const frames: Uint8Array[] = [
    Uint8Array.from([CELL_VISIBLE, CELL_BLOCKED, CELL_BLOCKED, CELL_BLOCKED]),
    Uint8Array.from([CELL_BLOCKED, CELL_VISIBLE, CELL_BLOCKED, CELL_BLOCKED]),
    Uint8Array.from([CELL_BLOCKED, CELL_BLOCKED, CELL_VISIBLE, CELL_VISIBLE]),
  ];
  const samples: Pt[] = [[0, 0], [3, 0], [6, 0]];
  const paints: number[] = [];
  const walker: (Pt | null)[] = [];
  const playback = new WalkPlayback({
    paint: (frame) => paints.push(frames.indexOf(frame!)),
    setWalker: (at) => walker.push(at),
  });
  let emits = 0;
  playback.subscribe(() => emits++);
  playback.load({ grid, frames, eyeM: 1.6 }, samples, 6);
  return { playback, paints, walker, emitCount: () => emits };
}

describe("WalkPlayback", () => {
  it("moves the walker every frame but repaints and notifies only at a new viewpoint", () => {
    const { playback, paints, walker, emitCount } = setup();
    playback.frameArrived(0);
    expect(paints).toEqual([0]);
    const before = emitCount();
    for (let k = 0; k < 10; k++) playback.advance(0.25);
    expect(walker.at(-1)![0]).toBeCloseTo(2.5, 6);
    expect(paints).toEqual([0]);
    expect(emitCount()).toBe(before);
    playback.advance(0.6);
    expect(paints).toEqual([0, 1]);
    expect(playback.getSnapshot()).toMatchObject({ index: 1, distanceM: 3 });
  });

  it("accumulates seen area and stops at the end", () => {
    const { playback } = setup();
    playback.frameArrived(0);
    expect(playback.advance(5.9)).toBe(true);
    expect(playback.advance(1)).toBe(false);
    const snap = playback.getSnapshot();
    expect(snap.index).toBe(2);
    expect(snap.seenHa).toBeCloseTo((4 * 100) / 10_000, 9);
    expect(snap.visiblePercent).toBeCloseTo(50, 9);
    playback.seekIndex(0);
    expect(playback.getSnapshot().seenHa).toBeCloseTo(100 / 10_000, 9);
  });
});

describe("WalkPlayback guards", () => {
  it("ignores a negative step (rAF timestamp earlier than the effect start)", () => {
    const { playback, walker } = setup();
    playback.frameArrived(0);
    expect(() => playback.advance(-0.01)).not.toThrow();
    expect(walker.at(-1)).toEqual([0, 0]);
  });
});
