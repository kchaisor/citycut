import type { WindRoseAsset, WindRoseStationRecord, SiteWindSelection } from "./windRoseData";
import { WIND_ROSE_SOURCE } from "./windRoseData";
import { readableWindStationName } from "./windStationNames";

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

export const WIND_STATION_SANE_MAX_WINTER_CALM_PCT = 30;
export const WIND_STATION_SANE_MAX_ANNUAL_CALM_PCT = 35;
export const WIND_STATION_SEARCH_MAX_KM = 28;

export function isWindStationSane(station: WindRoseStationRecord): boolean {
  const winter = station.seasons.winter.calmPct;
  const annual = station.seasons.annual.calmPct;
  return winter <= WIND_STATION_SANE_MAX_WINTER_CALM_PCT && annual <= WIND_STATION_SANE_MAX_ANNUAL_CALM_PCT;
}

export function nearestWindStation(
  asset: WindRoseAsset,
  siteLat: number,
  siteLon: number,
): { station: WindRoseStationRecord; distanceKm: number } | null {
  if (!asset.stations.length) return null;
  const ranked = asset.stations
    .map((station) => ({ station, distanceKm: haversineKm(siteLat, siteLon, station.lat, station.lon) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const sane = ranked.find((r) => r.distanceKm <= WIND_STATION_SEARCH_MAX_KM && isWindStationSane(r.station));
  if (sane) return sane;
  const nearest = ranked[0];
  if (!nearest) return null;
  return nearest;
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
      name: readableWindStationName(station.name, station.id),
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