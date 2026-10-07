import { describe, expect, it } from "vitest";
import { signedArea } from "./geo";
import { planPaths } from "./svgPlan";
import { waterFallbackFromCenterlines } from "./waterRibbonFallback";
import type { AreaFeat, CityModel, Pt, Ring } from "../types";

function model(areas: AreaFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: { lat: -37.8, lon: 145 },
    sideM: 200,
    frameShape: "square",
    layers: { buildings: false, roads: false, waterGreen: true, trees: false },
    buildings: [],
    roads: [],
    areas,
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

function pond(): AreaFeat {
  const ring: Ring = [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
    [-30, -30],
  ];
  return { id: 10, kind: "water", ring, holes: [] };
}

function park(): AreaFeat {
  const ring: Ring = [
    [40, 40],
    [60, 40],
    [60, 60],
    [40, 60],
    [40, 40],
  ];
  return { id: 11, kind: "green", ring, holes: [] };
}

describe("water blast radius", () => {
  it("leaves lake and park polygons unchanged on the site plan while trimming centreline fallback", () => {
    const lake = pond();
    const green = park();
    const baseAreas = [lake, green];
    const withFallback = [
      ...baseAreas,
      ...waterFallbackFromCenterlines(
        [
          {
            id: "in",
            line: [
              [0, 0],
              [10, 0],
            ] as Pt[],
            props: { class: "river" },
          },
          {
            id: "out",
            line: [
              [0, 90],
              [0, 110],
            ] as Pt[],
            props: { class: "river" },
          },
        ],
        [lake],
      ),
    ];
    const before = planPaths(model(baseAreas));
    const after = planPaths(model(withFallback));
    expect(before.green.map((g) => Math.abs(signedArea(g[0]!)))).toEqual(
      after.green.map((g) => Math.abs(signedArea(g[0]!))),
    );
    expect(before.water.map((w) => Math.abs(signedArea(w[0]!)))).toEqual(
      after.water.map((w) => Math.abs(signedArea(w[0]!))).slice(0, before.water.length),
    );
    expect(after.water.length).toBeGreaterThan(before.water.length);
  });
});
