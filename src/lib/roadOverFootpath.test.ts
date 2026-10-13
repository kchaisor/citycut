import { describe, expect, it } from "vitest";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon } from "polygon-clipping";
import { planPaths } from "./svgPlan";
import { SITE_LAYER_ORDER } from "./aiPlan";
import { SURFACE } from "./surfaceLayers";
import { circleRing } from "./roundabouts";
import type { CityModel, RoadFeat } from "../types";

type Clip = Pick<typeof import("polygon-clipping"), "difference" | "intersection">;
const loaded = polygonClipping as unknown as Clip & { default?: Clip };
const clip: Clip = typeof loaded.difference === "function" ? loaded : loaded.default!;

function area(mp: MultiPolygon): number {
  let total = 0;
  for (const polygon of mp)
    polygon.forEach((ring, index) => {
      let s = 0;
      for (let i = 0; i + 1 < ring.length; i++) s += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
      total += (index === 0 ? 1 : -1) * Math.abs(s / 2);
    });
  return total;
}

/** A roundabout with four approaches and a footway stub that ends inside the ring's island gap. */
function model(): CityModel {
  const road = (id: number, line: [number, number][], width = 5.5, grade?: "path"): RoadFeat => ({
    id,
    line,
    width,
    kind: "road",
    ...(grade ? { grade } : {}),
  });
  return {
    placeLabel: "test",
    center: { lat: -37.81, lon: 144.98 },
    sideM: 200,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    roads: [
      road(1, circleRing([0, 0], 10)),
      road(2, [[10, 0], [90, 0]]),
      road(3, [[-10, 0], [-90, 0]]),
      road(4, [[0, 10], [0, 90]]),
      road(5, [[0, -10], [0, -90]]),
      road(6, [[12, 14], [4, 4]], 1.8, "path"),
    ],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  } as CityModel;
}

const disc = (r: number): MultiPolygon => [[circleRing([0, 0], r).map(([x, y]) => [x, y] as [number, number])]];

describe("road fill sits above the kerb/footpath layer", () => {
  it("leaves no footpath showing inside the carriageway or its island gap", () => {
    const plan = planPaths(model(), undefined, 5, 1000, 5, 2500, { pathFilletM: 0 });
    // Inside the ring's outer kerb (less a 0.5 m edge allowance) is carriageway or island gap only.
    const pathInRing = clip.intersection(plan.pathFill, disc(12.25));
    expect(area(pathInRing)).toBeGreaterThan(1);
    expect(area(clip.difference(pathInRing, plan.roadFill))).toBeLessThan(0.01);
  });

  it("keeps the same order in the plan export and 3D: paths < roads < rail, trams, trees", () => {
    const at = (name: string) => SITE_LAYER_ORDER.indexOf(name as (typeof SITE_LAYER_ORDER)[number]);
    expect(at("Paths")).toBeLessThan(at("Roads"));
    for (const above of ["Rail", "Trams", "Trees", "Site boundary", "Annotation"]) expect(at("Roads")).toBeLessThan(at(above));
    expect(SURFACE.path.lift).toBeLessThan(SURFACE.local.lift);
    expect(SURFACE.path.renderOrder).toBeLessThan(SURFACE.local.renderOrder);
    expect(SURFACE.local.renderOrder).toBeLessThan(SURFACE.rail.renderOrder);
  });
});
