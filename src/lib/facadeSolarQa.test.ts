import { describe, expect, it } from "vitest";
import { assessFacadeSolar } from "./facadeSolarAssess";
import {
  facadeOverlayWallQa,
  pointInsideProposedMassing,
  proposedMassingBboxes,
  proposedMassingObliqueCamera,
} from "./facadeSolarQa";
import type { CityModel } from "../types";

const LAT = -37.8183;
const LON = 145.1235;

function stubModel(buildings: CityModel["buildings"]): CityModel {
  return {
    center: { lat: LAT, lon: LON },
    sideM: 200,
    frameShape: "square",
    terrain: null,
    buildings,
    roads: [],
    trees: [],
    layers: { buildings: true, roads: true, trees: true },
  } as unknown as CityModel;
}

describe("facadeSolarQa", () => {
  it("oblique camera targets proposed massing centroid", () => {
    const proposed = {
      id: -920001,
      ring: [
        [-10, -6],
        [18, -6],
        [18, 8],
        [-10, 8],
        [-10, -6],
      ] as import("../types").Ring,
      holes: [],
      height: 15.5,
      use: "unclassified" as const,
      source: "none" as const,
      proposedMassing: true as const,
    };
    const model = stubModel([proposed]);
    const box = proposedMassingBboxes(model)[0]!;
    const pose = proposedMassingObliqueCamera(box, "nw");
    expect(pointInsideProposedMassing(pose.target.x, -pose.target.z, [box], 4)).toBe(true);
    const bundle = assessFacadeSolar(model, LAT, LON, 2026);
    const qa = facadeOverlayWallQa(bundle, model, pose.target);
    expect(qa.verticesOnWalls).toBe(true);
    expect(qa.wallHeightSpanOk).toBe(true);
    expect(qa.facadeOverlayCells).toBeGreaterThan(10);
  });
});
