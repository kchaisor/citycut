import { describe, expect, it } from "vitest";
import { sitePlanChunks } from "./aiPlan";
import { maxConsecutiveJump } from "./roadLineValidation";
import { planPaths } from "./svgPlan";
import type { CityModel } from "../types";

function modelWithRoads(roads: CityModel["roads"]): CityModel {
  return {
    center: { lat: -37.794, lon: 144.945 },
    sideM: 800,
    placeLabel: "Test",
    sourceNote: "",
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    areas: [],
    roads,
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
  };
}

function jumpsInPolylines(lines: number[][][]): number {
  let max = 0;
  for (const line of lines) {
    const pts = line.map((p) => [p[0], p[1]] as [number, number]);
    max = Math.max(max, maxConsecutiveJump(pts));
  }
  return max;
}

describe("road export paths", () => {
  it("keeps site plan and AI path geometry free of long chords", () => {
    const roads: CityModel["roads"] = [
      { id: 1, line: [[-300, 0], [0, 0], [300, 0]], width: 6, kind: "road", grade: "local" },
      { id: 2, line: [[0, -300], [0, 0], [0, 300]], width: 4, kind: "rail" },
    ];
    const model = modelWithRoads(roads);
    const paths = planPaths(model, 1.2, 5, 5000);
    expect(jumpsInPolylines(paths.rails)).toBeLessThan(400);
    const pathChunk = sitePlanChunks(model, 5000).find((chunk) => chunk.name === "Paths");
    const pathLines = pathChunk?.paths?.flatMap((path) => path.rings.map((ring) => ring)) ?? [];
    expect(jumpsInPolylines(pathLines)).toBeLessThan(400);
  });
});
