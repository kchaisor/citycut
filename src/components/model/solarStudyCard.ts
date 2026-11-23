import { SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX, solarSliderTickHoursAt } from "../../lib/solarSlider";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export const SOLAR_CARD_TICK_HOURS = solarSliderTickHoursAt(SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX);

export function solarClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function solarClockFromMinutes(minutes: number): string {
  return solarClock(Math.floor(minutes / 60), minutes % 60);
}

export function solarStudyCardMeta(date: { month: number; day: number; hour: number; minute: number }): string {
  return `${date.day} ${MONTHS[date.month - 1] ?? ""} · ${solarClock(date.hour, date.minute)}`;
}

export function solarAzimuthLabel(azimuthDeg: number): string {
  const deg = Math.round(((azimuthDeg % 360) + 360) % 360);
  return `${deg}° ${COMPASS_8[Math.round(deg / 45) % 8]}`;
}

export function solarDaylightLabel(sunriseMin: number, sunsetMin: number): string {
  const span = Math.max(0, sunsetMin - sunriseMin);
  return `${Math.floor(span / 60)}h ${String(span % 60).padStart(2, "0")}m`;
}

export function sunDomeSizeNote(range: { autoM: number; maxM: number }, domeOn: boolean): string {
  if (!domeOn) return "Turn Sun dome on to resize it";
  return `Auto ${Math.round(range.autoM)} m for this cut · up to 2× the cut edge, ${Math.round(range.maxM)} m`;
}
