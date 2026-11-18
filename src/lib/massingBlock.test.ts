import { describe, expect, it } from "vitest";
import {
  MASSING_DEFAULT_WIDTH_M,
  MASSING_FLOOR_HEIGHT_M,
  centerlineLengthM,
  createMassingBlock,
  distanceToCutBoundaryM,
  footprintFromCenterline,
  blockFootprintInsideCut,
  footprintInsideCut,
  massingBlockHeight,
  snapDirection,
  snapDrawEnd,
  snapFloorsFromHeight,
  type MassingSnapContext,
} from "./massingBlock";

const squareCtx = (sideM = 200): MassingSnapContext => ({
  sideM,
  frameShape: "square",
  blocks: [],
});

describe("massingBlock geometry", () => {
  it("builds an L footprint that differs from a straight first-to-last bar", () => {
    const l: [[number, number], [number, number], [number, number]] = [
      [0, 0],
      [20, 0],
      [20, 20],
    ];
    const straight: [[number, number], [number, number]] = [
      [0, 0],
      [20, 20],
    ];
    const lRing = footprintFromCenterline(l, MASSING_DEFAULT_WIDTH_M, false);
    const straightRing = footprintFromCenterline(straight, MASSING_DEFAULT_WIDTH_M, false);
    expect(lRing.length).toBeGreaterThan(5);
    expect(straightRing.length).toBe(5);
    const lOpen = lRing.slice(0, -1);
    const diagOpen = straightRing.slice(0, -1);
    const same =
      lOpen.length === diagOpen.length &&
      lOpen.every((p, i) => Math.hypot(p[0] - diagOpen[i]![0], p[1] - diagOpen[i]![1]) < 1e-3);
    expect(same).toBe(false);
    const lMaxY = Math.max(...lOpen.map((p) => p[1]));
    expect(lMaxY).toBeGreaterThan(18);
  });

  it("builds a rectangle footprint with default width from a two-point centerline", () => {
    const centerline: [[number, number], [number, number]] = [
      [0, 0],
      [20, 0],
    ];
    const ring = footprintFromCenterline(centerline, MASSING_DEFAULT_WIDTH_M, false);
    expect(ring.length).toBe(5);
    const width = Math.hypot(ring[0]![0] - ring[1]![0], ring[0]![1] - ring[1]![1]);
    expect(width).toBeCloseTo(MASSING_DEFAULT_WIDTH_M, 5);
    expect(centerlineLengthM(centerline)).toBeCloseTo(20, 5);
  });

  it("computes block height from floors", () => {
    expect(massingBlockHeight({ floors: 4, floorHeight_m: MASSING_FLOOR_HEIGHT_M })).toBeCloseTo(12.4, 5);
    expect(snapFloorsFromHeight(12.4, MASSING_FLOOR_HEIGHT_M)).toBe(4);
  });

  it("snaps draw direction to cut-edge angles within 5 degrees", () => {
    const ctx = squareCtx();
    const raw = snapDirection([1, 0.08], ctx);
    expect(Math.atan2(raw[1], raw[0])).toBeCloseTo(0, 2);
    const end = snapDrawEnd([0, 0], [30, 2], ctx);
    expect(end[0]).toBeGreaterThan(25);
    expect(Math.abs(end[1])).toBeLessThan(0.5);
  });

  it("measures distance to square cut boundary", () => {
    const d = distanceToCutBoundaryM([95, 0], 200, "square");
    expect(d).toBeCloseTo(5, 3);
  });

  it("rejects footprints outside the cut", () => {
    const ring = footprintFromCenterline(
      [
        [95, 0],
        [105, 0],
      ],
      10,
      false,
    );
    expect(footprintInsideCut(ring, 200, "square")).toBe(false);
    const inside = footprintFromCenterline(
      [
        [-10, 0],
        [10, 0],
      ],
      10,
      false,
    );
    expect(footprintInsideCut(inside, 200, "square")).toBe(true);
  });

  it("accepts a horizontal block inside a 1 km square cut", () => {
    const block = createMassingBlock("cut-a", [
      [-18, -6],
      [18, -6],
    ]);
    expect(blockFootprintInsideCut(block, 1000, "square")).toBe(true);
  });

  it("creates blocks with defaults", () => {
    const block = createMassingBlock("cut-a", [
      [0, 0],
      [12, 0],
    ]);
    expect(block.width_m).toBe(MASSING_DEFAULT_WIDTH_M);
    expect(block.floors).toBe(4);
    expect(block.cutId).toBe("cut-a");
  });
});
