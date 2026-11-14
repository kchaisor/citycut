import type { WindRoseAsset, WindRoseStationRecord, SiteWindSelection } from "./windRoseData";
import { WIND_ROSE_SOURCE } from "./windRoseData";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestWindStation(
  asset: WindRoseAsset,
  siteLat: number,
  siteLon: number,
): { station: WindRoseStationRecord; distanceKm: number } | null {
  if (!asset.stations.length) return null;
  let best: WindRoseStationRecord | null = null;
  let bestKm = Infinity;
  for (const station of asset.stations) {
    const km = haversineKm(siteLat, siteLon, station.lat, station.lon);
    if (km < bestKm) {
      bestKm = km;
      best = station;
    }
  }
  if (!best) return null;
  return { station: best, distanceKm: bestKm };
}

export function siteWindSelection(
  asset: WindRoseAsset,
  siteLat: number,
  siteLon: number,
): SiteWindSelection | null {
  const pick = nearestWindStation(asset, siteLat, siteLon);
  if (!pick) return null;
  const { station, distanceKm } = pick;
  return {
    asset,
    station: {
      name: station.name,
      id: station.id,
      lat: station.lat,
      lon: station.lon,
      distanceKm,
      heightM: station.heightM,
      periodStart: station.periodStart,
      periodEnd: station.periodEnd,
      source: WIND_ROSE_SOURCE,
    },
  };
}

export function stationIdFromZipName(zipName: string): string {
  const match = /(\d{6})_TMYx/.exec(zipName);
  return match?.[1] ?? zipName.replace(/\.zip$/i, "");
}

export function preferTmyxZipName(names: readonly string[]): string | null {
  const tmyx = names.filter((n) => /_TMYx/i.test(n) && n.endsWith(".zip"));
  if (!tmyx.length) return null;
  const ranked = (name: string) => {
    if (name.includes("2009-2023")) return 0;
    if (name.includes("2011-2025")) return 1;
    if (name.includes("2007-2021")) return 2;
    if (/\.(\d{4})-(\d{4})\.zip$/.test(name)) return 3;
    if (/_TMYx\.zip$/i.test(name)) return 4;
    return 5;
  };
  return [...tmyx].sort((a, b) => ranked(a) - ranked(b))[0] ?? null;
}