import * as SunCalc from "suncalc";

export const MELBOURNE_TZ = "Australia/Melbourne";

/** Southern-hemisphere solstice and equinox dates used for the heliodon presets. */
export const SOLAR_SUMMER = { month: 12, day: 21, label: "Summer solstice" };
export const SOLAR_WINTER = { month: 6, day: 21, label: "Winter solstice" };
export const SOLAR_EQUINOX = { month: 9, day: 22, label: "Equinox" };

export type SolarPresetId = "equinox-9" | "equinox-12" | "equinox-15" | "winter-12";

export const SOLAR_PRESETS: Record<
  SolarPresetId,
  { label: string; month: number; day: number; hour: number; minute: number }
> = {
  "equinox-9": { label: "Equinox 9am", month: SOLAR_EQUINOX.month, day: SOLAR_EQUINOX.day, hour: 9, minute: 0 },
  "equinox-12": { label: "Equinox 12pm", month: SOLAR_EQUINOX.month, day: SOLAR_EQUINOX.day, hour: 12, minute: 0 },
  "equinox-15": { label: "Equinox 3pm", month: SOLAR_EQUINOX.month, day: SOLAR_EQUINOX.day, hour: 15, minute: 0 },
  "winter-12": { label: "Winter solstice 12pm", month: SOLAR_WINTER.month, day: SOLAR_WINTER.day, hour: 12, minute: 0 },
};

export type Vec3 = [number, number, number];

export type SolarSample = {
  date: Date;
  altitudeDeg: number;
  azimuthDeg: number;
  direction: Vec3;
  aboveHorizon: boolean;
};

const melbourneParts = new Intl.DateTimeFormat("en-AU", {
  timeZone: MELBOURNE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function readMelbourneParts(date: Date) {
  const parts = melbourneParts.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Convert a Melbourne local civil time to a UTC instant (DST aware). */
export function melbourneLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let pass = 0; pass < 4; pass++) {
    const shown = readMelbourneParts(new Date(guess));
    const desiredMinutes = (((hour * 60 + minute) % (24 * 60)) + 24 * 60) % (24 * 60);
    const shownMinutes = shown.hour * 60 + shown.minute;
    let deltaMinutes = desiredMinutes - shownMinutes;
    if (deltaMinutes > 12 * 60) deltaMinutes -= 24 * 60;
    if (deltaMinutes < -12 * 60) deltaMinutes += 24 * 60;
    const dayDelta =
      year * 372 + month * 31 + day - (shown.year * 372 + shown.month * 31 + shown.day);
    guess += dayDelta * 86_400_000 + deltaMinutes * 60_000 + (second - shown.second) * 1000;
  }
  return new Date(guess);
}

/**
 * Unit direction from the site origin toward the sun in CityCut's Three.js frame:
 * +X east, +Y up, +Z = −north (north is −Z).
 */
export function sunDirectionFromAzimuthAltitude(azimuthDeg: number, altitudeDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const horizontal = Math.cos(alt);
  const x = horizontal * Math.sin(az);
  const z = -horizontal * Math.cos(az);
  const y = Math.sin(alt);
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function sunSample(lat: number, lon: number, when: Date): SolarSample {
  const pos = SunCalc.getPosition(when, lat, lon);
  const direction = sunDirectionFromAzimuthAltitude(pos.azimuth, pos.altitude);
  return {
    date: when,
    altitudeDeg: pos.altitude,
    azimuthDeg: pos.azimuth,
    direction,
    aboveHorizon: pos.altitude > 0,
  };
}

export function sunAtMelbourneLocal(
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): SolarSample {
  return sunSample(lat, lon, melbourneLocalToUtc(year, month, day, hour, minute));
}

/** Sample the sun every `stepMinutes` between Melbourne sunrise and sunset on the given local date. */
export function daylightArcSamples(
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  stepMinutes = 15,
): SolarSample[] {
  const noon = melbourneLocalToUtc(year, month, day, 12, 0);
  const times = SunCalc.getTimes(noon, lat, lon);
  const start = times.sunrise;
  const end = times.sunset;
  if (!start || !end) return [];
  const out: SolarSample[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += stepMinutes * 60_000) {
    out.push(sunSample(lat, lon, new Date(t)));
  }
  return out;
}

export type HourMark = { hour: number; sample: SolarSample };

/** Whole Melbourne clock hours (AEST or AEDT, as the date falls) when the sun is above the horizon. */
export function daylightHourMarks(lat: number, lon: number, year: number, month: number, day: number): HourMark[] {
  const marks: HourMark[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const sample = sunAtMelbourneLocal(lat, lon, year, month, day, hour, 0);
    if (sample.aboveHorizon) marks.push({ hour, sample });
  }
  return marks;
}

export function dayOfYear(year: number, month: number, day: number): number {
  const utc = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 0);
  return Math.floor((utc - start) / 86_400_000);
}

export function dateFromDayOfYear(year: number, doy: number): { month: number; day: number } {
  const date = new Date(Date.UTC(year, 0, doy));
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
