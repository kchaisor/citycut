import { reverseLocality } from "./nominatim";
import { localityName, type GeocoderAddress } from "./placeLabel";
import type { LonLat } from "../types";

const QA_SUBURBS: { name: string; west: number; south: number; east: number; north: number }[] = [
  { name: "Carlton", west: 144.958, south: -37.812, east: 144.972, north: -37.796 },
  { name: "Fitzroy", west: 144.972, south: -37.812, east: 144.992, north: -37.796 },
  { name: "Melbourne", west: 144.948, south: -37.822, east: 144.978, north: -37.802 },
  { name: "East Melbourne", west: 144.978, south: -37.822, east: 144.995, north: -37.804 },
];

export function isDemographicsQaMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("qa");
}

export function qaSuburbLabelAt(lon: number, lat: number): string | null {
  for (const box of QA_SUBURBS) {
    if (lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north) {
      return box.name;
    }
  }
  return null;
}

export function suburbLabelFromGeocoderAddress(address: GeocoderAddress): string | null {
  return localityName(address);
}

export async function resolveDemographicsPinLabel(
  point: LonLat,
  signal?: AbortSignal,
): Promise<string> {
  if (isDemographicsQaMode()) {
    const qa = qaSuburbLabelAt(point.lon, point.lat);
    if (qa) return qa;
  }
  const formatted = await reverseLocality(point.lat, point.lon, signal);
  const first = formatted.split(/\s+/)[0];
  return first || formatted;
}
