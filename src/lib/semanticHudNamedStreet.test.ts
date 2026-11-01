import { describe, expect, it } from "vitest";
import { pickNamedStreetWalkSite, walkCameraFromSite } from "./semanticHudNamedStreet";
import type { BuildingFeat, RoadFeat, TerrainField } from "../types";

const terrain: TerrainField = {
  cols: 3,
  rows: 3,
  heights: new Float32Array([80, 80, 80, 80, 80, 80, 80, 80, 80]),
  min: 80,
  max: 80,
  spacingM: 100,
  zoom: 14,
  metresPerPixel: 1,
  source: "test",
};

describe("pickNamedStreetWalkSite", () => {
  it("prefers a named street with buildings on both sides", () => {
    const roads: RoadFeat[] = [
      {
        id: 1,
        name: "Whitehorse Road",
        width: 12,
        kind: "road",
        grade: "arterial",
        line: [
          [-100, 0],
          [100, 0],
        ],
      },
    ];
    const buildings: BuildingFeat[] = [
      {
        id: 10,
        ring: [
          [-30, 10],
          [-10, 10],
          [-10, 30],
          [-30, 30],
          [-30, 10],
        ],
        holes: [],
        height: 18,
        use: "commercial",
        source: "overture_class",
      },
      {
        id: 11,
        ring: [
          [10, -30],
          [30, -30],
          [30, -10],
          [10, -10],
          [10, -30],
        ],
        holes: [],
        height: 22,
        use: "residential",
        source: "overture_class",
      },
    ];
    const site = pickNamedStreetWalkSite(roads, buildings, terrain, 400);
    expect(site?.road.name).toBe("Whitehorse Road");
    expect(site?.leftHeightM).toBeGreaterThan(0);
    expect(site?.rightHeightM).toBeGreaterThan(0);
    const cam = walkCameraFromSite(site!, 80);
    expect(cam.eye.y).toBeGreaterThan(81);
  });
});
