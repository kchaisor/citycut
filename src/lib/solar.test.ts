import { describe, expect, it } from "vitest";
import {
  MELBOURNE_TZ,
  daylightArcSamples,
  melbourneLocalToUtc,
  sunAtMelbourneLocal,
  sunDirectionFromAzimuthAltitude,
} from "./solar";

const MELBOURNE = { lat: -37.8136, lon: 144.9631 };

describe("solar mapping", () => {
  it("maps equinox solar noon to roughly north at ~52° in the local frame", () => {
    const sample = sunAtMelbourneLocal(MELBOURNE.lat, MELBOURNE.lon, 2026, 9, 22, 12, 0);
    const northOffset = Math.min(sample.azimuthDeg, 360 - sample.azimuthDeg);
    expect(northOffset).toBeLessThan(15);
    expect(sample.altitudeDeg).toBeGreaterThan(48);
    expect(sample.altitudeDeg).toBeLessThan(56);
    const [x, y, z] = sample.direction;
    expect(Math.abs(x)).toBeLessThan(0.15);
    expect(z).toBeLessThan(-0.5);
    expect(y).toBeGreaterThan(0.75);
  });

  it("converts Melbourne local time with DST on summer and standard time in winter", () => {
    const summer = melbourneLocalToUtc(2026, 1, 15, 12, 0);
    const winter = melbourneLocalToUtc(2026, 7, 15, 12, 0);
    const fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: MELBOURNE_TZ,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(fmt.format(summer)).toContain("+11");
    expect(fmt.format(winter)).toContain("+10");
    expect(summer.getTime()).not.toBe(winter.getTime());
  });

  it("maps azimuth 0° north to −Z", () => {
    const [x, y, z] = sunDirectionFromAzimuthAltitude(0, 45);
    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(y).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("samples daylight every 15 minutes on the equinox", () => {
    const arc = daylightArcSamples(MELBOURNE.lat, MELBOURNE.lon, 2026, 9, 22, 15);
    expect(arc.length).toBeGreaterThan(20);
    expect(arc[0].altitudeDeg).toBeGreaterThan(-1);
    expect(arc.at(-1)!.altitudeDeg).toBeGreaterThan(-1);
    const stepMs = arc[1].date.getTime() - arc[0].date.getTime();
    expect(stepMs).toBe(15 * 60_000);
  });
});
