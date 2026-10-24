import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildContourLineObject, drapeContourSegments, drapeContourSegmentsWithDistances } from "./contourLines3d";
import type { CityModel } from "../types";

describe("contour drape", () => {
  it("splits long segments so every piece sits on the sampled terrain", () => {
    const bump = (east: number) => 10 - Math.abs(east) / 10; // ridge at east = 0
    const positions = drapeContourSegments([[[-50, 0], [50, 0]]], (east) => bump(east), 25, 0.5);
    // 100 m at a 25 m step: 4 pieces, 6 numbers each.
    expect(positions.length).toBe(4 * 6);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 1]).toBeCloseTo(bump(positions[i]!) + 0.5, 6);
    }
    // The ridge top is a vertex, so the line does not cut under it.
    expect(positions.some((value, i) => i % 3 === 0 && Math.abs(value) < 1e-9)).toBe(true);
  });

  it("keeps a short segment whole and maps north to -Z", () => {
    const positions = drapeContourSegments([[[0, 0], [3, 4]]], () => 2, 25, 0);
    expect(positions).toEqual([0, 2, -0, 3, 2, -4]);
  });

  it("accumulates lineDistance along draped pieces and builds a dashed 3D line object", () => {
    const { lineDistances } = drapeContourSegmentsWithDistances([[[0, 0], [10, 0], [10, 20]]], () => 0, 5, 0);
    expect(lineDistances).toEqual([0, 5, 5, 10, 10, 15, 15, 20, 20, 25, 25, 30]);
    const model = {
      center: { lat: -37.8, lon: 145 },
      sideM: 100,
      buildings: [],
      roads: [],
      areas: [],
      trees: [],
      layers: { buildings: true, roads: true, water: true, green: true, trees: true, terrain: true },
      contourLayer: {
        source: "vicmap-1m",
        label: "Vicmap",
        attribution: "",
        interval: 1,
        lines: [{ z: 10, points: [[-20, 0], [20, 0]] }],
      },
    } as unknown as CityModel;
    const obj = buildContourLineObject(model);
    expect(obj).not.toBeNull();
    expect(obj!.material).toBeInstanceOf(THREE.LineDashedMaterial);
    expect(obj!.geometry.getAttribute("lineDistance")?.count).toBe(obj!.geometry.getAttribute("position")?.count);
  });
});
