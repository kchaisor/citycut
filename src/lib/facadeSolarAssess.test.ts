import { describe, expect, it } from "vitest";
import { assessFacadeSolar, facadeOverlayPoints } from "./facadeSolarAssess";
import { facadeOverlayGeometry } from "../components/FacadeSolarPointsLayer";
import { facadeBayUnitsForModel, podiumReceptorUnitsForModel } from "./facadeSolarSample";
import { sunAtMelbourneLocal } from "./solar";
import { planToWorld, worldOutward3, type FacadeUnitSample } from "./facadeSolarTypes";
import type { CityModel } from "../types";

const LAT = -37.8183;
const LON = 145.1235;
const YEAR = 2026;

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

function proposedBox(id: number, ring: CityModel["buildings"][0]["ring"], height: number) {
  return {
    id,
    ring,
    holes: [],
    height,
    use: "residential" as const,
    source: "none" as const,
    proposedMassing: true as const,
  };
}

function analyticFacingHours(sample: FacadeUnitSample, month: number, day: number): number {
  let lit = 0;
  for (const hour of [9, 10, 11, 12, 13, 14, 15]) {
    const sun = sunAtMelbourneLocal(LAT, LON, YEAR, month, day, hour, 0);
    if (!sun.aboveHorizon) continue;
    const outward = worldOutward3(sample.outwardEast, sample.outwardNorth);
    const dot = outward[0] * sun.direction[0] + outward[1] * sun.direction[1] + outward[2] * sun.direction[2];
    if (dot > 0.04) lit += 1;
  }
  return lit;
}

describe("facade solar assess", () => {
  it("north-facing facade bays get sun with no blocker; blocked north wall gets 0 h", () => {
    const proposed = proposedBox(
      -9001,
      [
        [-8, -8],
        [8, -8],
        [8, 8],
        [-8, 8],
        [-8, -8],
      ],
      9.3,
    );
    const clear = assessFacadeSolar(stubModel([proposed]), LAT, LON, YEAR);
    const northUnits = (clear.facade?.units ?? []).filter((unit) => unit.id.includes("-f") && unit.hoursDirect >= 0);
    const maxClear = Math.max(0, ...northUnits.map((unit) => unit.hoursDirect));
    expect(maxClear).toBeGreaterThan(0);

    const blocker = {
      id: -9002,
      ring: [
        [-30, 12],
        [30, 12],
        [30, 45],
        [-30, 45],
        [-30, 12],
      ] as import("../types").Ring,
      holes: [],
      height: 45,
      use: "commercial" as const,
      source: "none" as const,
    };
    const blocked = assessFacadeSolar(stubModel([proposed, blocker]), LAT, LON, YEAR);
    const northBlocked = (blocked.facade?.units ?? []).filter((unit) => unit.id.includes("e2") || unit.id.includes("e3"));
    const maxBlocked = Math.max(0, ...northBlocked.map((unit) => unit.hoursDirect));
    expect(maxBlocked).toBe(0);
    expect(maxClear).toBeGreaterThan(maxBlocked + 2);
  });

  it("unobstructed north wall matches manual sun-direction count within one step", () => {
    const proposed = proposedBox(
      -9003,
      [
        [-4, -4],
        [4, -4],
        [4, 4],
        [-4, 4],
        [-4, -4],
      ],
      6.2,
    );
    const model = stubModel([proposed]);
    const samples = facadeBayUnitsForModel(model).filter((sample) => sample.outwardNorth > 0.9);
    expect(samples.length).toBeGreaterThan(0);
    const bundle = assessFacadeSolar(model, LAT, LON, YEAR);
    const byId = new Map(bundle.facade?.units.map((unit) => [unit.id, unit]) ?? []);
    const sample = samples[0]!;
    const assessed = byId.get(sample.id)?.hoursDirect ?? -1;
    const analytic = analyticFacingHours(sample, 6, 21);
    expect(Math.abs(assessed - analytic)).toBeLessThanOrEqual(1);
    void planToWorld(sample.east, sample.north, sample.yM);
  });

  it("3D overlay draws every assessed unit at its assessed position, without resampling the scene model", () => {
    const proposed = proposedBox(
      -9004,
      [
        [-10, -6],
        [10, -6],
        [10, 6],
        [-10, 6],
        [-10, -6],
      ],
      15.5,
    );
    const assessModel = stubModel([proposed]);
    const bundle = assessFacadeSolar(assessModel, LAT, LON, YEAR);
    const facadeSamples = facadeBayUnitsForModel(assessModel);
    const podiumSamples = podiumReceptorUnitsForModel(assessModel);
    expect(bundle.facade?.unitCount).toBe(facadeSamples.length);

    const overlay = facadeOverlayPoints(bundle);
    expect(overlay.length).toBe(facadeSamples.length + podiumSamples.length);
    const samplesById = new Map([...facadeSamples, ...podiumSamples].map((sample) => [sample.id, sample]));
    for (const point of overlay) {
      const sample = samplesById.get(point.id)!;
      expect([point.east, point.north, point.yM]).toEqual([sample.east, sample.north, sample.yM]);
    }
    const podiumPoint = overlay.find((point) => point.id.startsWith("podium-"))!;
    const podiumUnit = bundle.podium!.units.find((unit) => unit.id === podiumPoint.id)!;
    expect(podiumPoint.hoursDirect).toBe(podiumUnit.hoursDirect);

    const geometry = facadeOverlayGeometry(bundle);
    expect(geometry.attributes.position!.count).toBe(overlay.length);
    const [x, y, z] = planToWorld(overlay[0]!.east, overlay[0]!.north, overlay[0]!.yM);
    expect(geometry.attributes.position!.getX(0)).toBeCloseTo(x, 4);
    expect(geometry.attributes.position!.getY(0)).toBeCloseTo(y, 4);
    expect(geometry.attributes.position!.getZ(0)).toBeCloseTo(z, 4);
    expect(geometry.boundingSphere?.radius ?? 0).toBeGreaterThan(5);
    expect(facadeOverlayGeometry({ facade: null, podium: null, assessMs: 0 }).attributes.position!.count).toBe(0);
  });
});
