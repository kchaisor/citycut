import { describe, expect, it } from "vitest";
import {
  SOLAR_EQUINOX,
  SOLAR_SUMMER,
  SOLAR_WINTER,
  daylightArcSamples,
  daylightHourMarks,
  melbourneLocalToUtc,
  sunAtMelbourneLocal,
  type SolarSample,
} from "./solar";

const CBD = { lat: -37.8136, lon: 144.9631 };
const YEAR = 2026;

/** Highest sun of the Melbourne local day, searched minute by minute from the site lat/lon. */
function solarNoon(month: number, day: number): { sample: SolarSample; minutes: number } {
  let best = { sample: sunAtMelbourneLocal(CBD.lat, CBD.lon, YEAR, month, day, 10, 0), minutes: 600 };
  for (let minutes = 600; minutes <= 15 * 60; minutes++) {
    const sample = sunAtMelbourneLocal(CBD.lat, CBD.lon, YEAR, month, day, Math.floor(minutes / 60), minutes % 60);
    if (sample.altitudeDeg > best.sample.altitudeDeg) best = { sample, minutes };
  }
  return best;
}

function offNorth(azimuthDeg: number): number {
  const a = ((azimuthDeg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

describe("Melbourne sun-path geometry", () => {
  it("puts winter solar noon at about 28.8° due north, near 12:20 AEST", () => {
    const noon = solarNoon(SOLAR_WINTER.month, SOLAR_WINTER.day);
    expect(noon.sample.altitudeDeg).toBeGreaterThan(28.8 - 1.5);
    expect(noon.sample.altitudeDeg).toBeLessThan(28.8 + 1.5);
    expect(Math.abs(offNorth(noon.sample.azimuthDeg))).toBeLessThan(3);
    expect(Math.abs(noon.minutes - (12 * 60 + 20))).toBeLessThanOrEqual(10);
    const utc = melbourneLocalToUtc(YEAR, SOLAR_WINTER.month, SOLAR_WINTER.day, 12, 0);
    expect(utc.getUTCHours()).toBe(2);
  });

  it("puts summer solar noon at about 75.6° due north, near 13:10 AEDT, with 12pm lower and east of north", () => {
    const noon = solarNoon(SOLAR_SUMMER.month, SOLAR_SUMMER.day);
    expect(noon.sample.altitudeDeg).toBeGreaterThan(75.6 - 1.5);
    expect(noon.sample.altitudeDeg).toBeLessThan(75.6 + 1.5);
    expect(Math.abs(offNorth(noon.sample.azimuthDeg))).toBeLessThan(3);
    expect(Math.abs(noon.minutes - (13 * 60 + 10))).toBeLessThanOrEqual(10);
    const utc = melbourneLocalToUtc(YEAR, SOLAR_SUMMER.month, SOLAR_SUMMER.day, 12, 0);
    expect(utc.getUTCHours()).toBe(1);

    const midday = sunAtMelbourneLocal(CBD.lat, CBD.lon, YEAR, SOLAR_SUMMER.month, SOLAR_SUMMER.day, 12, 0);
    expect(midday.altitudeDeg).toBeLessThan(noon.sample.altitudeDeg - 3);
    expect(offNorth(midday.azimuthDeg)).toBeGreaterThan(10);
    expect(offNorth(midday.azimuthDeg)).toBeLessThan(90);
  });

  it("puts equinox solar noon at about 52°", () => {
    const noon = solarNoon(SOLAR_EQUINOX.month, SOLAR_EQUINOX.day);
    expect(noon.sample.altitudeDeg).toBeGreaterThan(52 - 1.5);
    expect(noon.sample.altitudeDeg).toBeLessThan(52 + 1.5);
    expect(Math.abs(offNorth(noon.sample.azimuthDeg))).toBeLessThan(3);
  });

  it("rises north of east and sets north of west in winter, and south of both in summer", () => {
    const winter = daylightArcSamples(CBD.lat, CBD.lon, YEAR, SOLAR_WINTER.month, SOLAR_WINTER.day, 5);
    const summer = daylightArcSamples(CBD.lat, CBD.lon, YEAR, SOLAR_SUMMER.month, SOLAR_SUMMER.day, 5);
    expect(winter[0].azimuthDeg).toBeLessThan(90);
    expect(winter[winter.length - 1].azimuthDeg).toBeGreaterThan(270);
    expect(summer[0].azimuthDeg).toBeGreaterThan(90);
    expect(summer[summer.length - 1].azimuthDeg).toBeLessThan(270);
  });

  it("orders the arcs Jun 21 lowest and Dec 21 highest, all through the north", () => {
    const peak = (month: number, day: number) => solarNoon(month, day).sample;
    const winter = peak(SOLAR_WINTER.month, SOLAR_WINTER.day);
    const equinox = peak(SOLAR_EQUINOX.month, SOLAR_EQUINOX.day);
    const summer = peak(SOLAR_SUMMER.month, SOLAR_SUMMER.day);
    expect(winter.altitudeDeg).toBeLessThan(equinox.altitudeDeg);
    expect(equinox.altitudeDeg).toBeLessThan(summer.altitudeDeg);
    for (const sample of [winter, equinox, summer]) expect(sample.direction[2]).toBeLessThan(0);
  });

  it("labels only above-horizon clock hours, in AEST for June and AEDT for December", () => {
    const winter = daylightHourMarks(CBD.lat, CBD.lon, YEAR, SOLAR_WINTER.month, SOLAR_WINTER.day);
    const summer = daylightHourMarks(CBD.lat, CBD.lon, YEAR, SOLAR_SUMMER.month, SOLAR_SUMMER.day);
    expect(winter.map((mark) => mark.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(summer[0].hour).toBe(6);
    expect(summer[summer.length - 1].hour).toBe(20);
    for (const mark of [...winter, ...summer]) expect(mark.sample.altitudeDeg).toBeGreaterThan(0);
  });
});
