import { describe, expect, it } from "vitest";
import { daylightWindowMinutes, sunAtMelbourneLocal, sweepMinute } from "./solar";

const MEL = { lat: -37.8136, lon: 144.9631 };

describe("sun study sweep (mock)", () => {
  it("21 Jun Melbourne daylight window matches NOAA (sunrise 07:36, sunset 17:08 AEST)", () => {
    const w = daylightWindowMinutes(MEL.lat, MEL.lon, 2026, 6, 21)!;
    expect(w.sunrise).toBe(7 * 60 + 36);
    expect(w.sunset).toBe(17 * 60 + 8);
  });

  it("21 Dec window is in AEDT", () => {
    const w = daylightWindowMinutes(MEL.lat, MEL.lon, 2026, 12, 21)!;
    expect(w.sunrise).toBeGreaterThan(5 * 60 + 50);
    expect(w.sunrise).toBeLessThan(6 * 60 + 5);
    expect(w.sunset).toBeGreaterThan(20 * 60 + 35);
  });

  it("matches the NOAA solar calculator at 21 Jun noon within 0.05 deg", () => {
    const s = sunAtMelbourneLocal(MEL.lat, MEL.lon, 2026, 6, 21, 12, 0);
    expect(s.azimuthDeg).toBeCloseTo(5.71, 1);
    expect(s.altitudeDeg).toBeCloseTo(28.56, 1);
  });

  it("advances by hours-per-second and wraps at sunset", () => {
    const w = { sunrise: 456, sunset: 1028 };
    expect(sweepMinute(600, 1, 1, w)).toBe(660);
    expect(sweepMinute(1020, 1, 1, w)).toBe(456);
    expect(sweepMinute(100, 0.5, 2, w)).toBe(516);
  });
});
