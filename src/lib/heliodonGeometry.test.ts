import { describe, expect, it } from "vitest";
import {
  HELIODON_LIFT_M,
  altitudeRingRadius,
  dialPoint,
  heliodonPoint,
  horizonArcDirections,
  type GroundHeight,
} from "./heliodonGeometry";
import { SOLAR_EQUINOX, SOLAR_SUMMER, SOLAR_WINTER, sunDirectionFromAzimuthAltitude } from "./solar";

const CBD = { lat: -37.8136, lon: 144.9631 };
const RADIUS = 360;
const flat: GroundHeight = () => 0;
const sloped: GroundHeight = (x, z) => 20 + x * 0.02 - z * 0.03;

function bearing(x: number, z: number): number {
  return ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
}

describe("heliodon dial geometry", () => {
  for (const date of [SOLAR_SUMMER, SOLAR_EQUINOX, SOLAR_WINTER]) {
    it(`lands the ${date.label} arc ends on the horizon ring`, () => {
      const directions = horizonArcDirections(CBD.lat, CBD.lon, 2026, date.month, date.day);
      expect(directions.length).toBeGreaterThan(10);
      for (const ground of [flat, sloped]) {
        for (const end of [directions[0], directions[directions.length - 1]]) {
          const [x, y, z] = heliodonPoint(end, RADIUS, ground);
          expect(Math.hypot(x, z)).toBeCloseTo(RADIUS, 6);
          const ring = dialPoint(bearing(x, z), RADIUS, ground);
          expect(x).toBeCloseTo(ring[0], 6);
          expect(y).toBeCloseTo(ring[1], 6);
          expect(z).toBeCloseTo(ring[2], 6);
        }
      }
      for (const direction of directions.slice(1, -1)) expect(direction[1]).toBeGreaterThan(0);
    });
  }

  it("puts a 10° sun on the 10° altitude ring in plan", () => {
    for (const altitude of [10, 30, 60]) {
      const [x, y, z] = heliodonPoint(sunDirectionFromAzimuthAltitude(40, altitude), RADIUS, flat);
      expect(Math.hypot(x, z)).toBeCloseTo(altitudeRingRadius(altitude, RADIUS), 6);
      expect(y).toBeCloseTo(HELIODON_LIFT_M + RADIUS * Math.sin((altitude * Math.PI) / 180), 6);
    }
  });

  it("puts true north at −Z on the dial", () => {
    const [x, , z] = dialPoint(0, RADIUS, flat);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-RADIUS, 9);
  });
});
