import type { WindRoseAsset, WindRoseStationRecord, SiteWindSelection, WindStationSkip } from "./windRoseData";
import { WIND_ROSE_SOURCE } from "./windRoseData";
import { readableWindStationName } from "./windStationNames";
import { areWindSeasonsSane } from "./windStationSanity";
import { WIND_REFERENCE_STATION_RULES, type WindReferenceStationRule } from "./windReferenceStations";

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

export const WIND_STATION_SEARCH_MAX_KM = 28;

export function isWindStationSane(station: WindRoseStationRecord): boolean {
  return areWindSeasonsSane(station.seasons);
}

export const WIND_STATION_SKIPPED_MAX = 3;
export const WIND_STATION_REASON_NEAREST = "nearest";

type RankedWindStation = { station: WindRoseStationRecord; distanceKm: number };

export type WindStationPick = RankedWindStation & {
  reason: string;
  skippedCloser: WindStationSkip[];
};

function rankWindStations(asset: WindRoseAsset, siteLat: number, siteLon: number): RankedWindStation[] {
  return asset.stations
    .map((station) => ({ station, distanceKm: haversineKm(siteLat, siteLon, station.lat, station.lon) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function referenceStationRule(siteLat: number, siteLon: number): WindReferenceStationRule | null {
  return (
    WIND_REFERENCE_STATION_RULES.find(
      (rule) => haversineKm(siteLat, siteLon, rule.centre.lat, rule.centre.lon) <= rule.radiusKm,
    ) ?? null
  );
}

function calmSkipReason(station: WindRoseStationRecord): string {
  return `wind record mostly calm, ${Math.round(station.seasons.winter.calmPct)}% calm in winter`;
}

function skippedCloser(
  ranked: RankedWindStation[],
  chosen: RankedWindStation,
  rule: WindReferenceStationRule | null,
): WindStationSkip[] {
  return ranked
    .filter(
      (r) => r.station !== chosen.station && r.distanceKm < chosen.distanceKm && r.distanceKm <= WIND_STATION_SEARCH_MAX_KM,
    )
    .slice(0, WIND_STATION_SKIPPED_MAX)
    .map((r) => ({
      name: readableWindStationName(r.station.name, r.station.id),
      distanceKm: r.distanceKm,
      reason: !isWindStationSane(r.station) ? calmSkipReason(r.station) : (rule?.skippedReason ?? WIND_STATION_REASON_NEAREST),
    }));
}

export function nearestWindStation(asset: WindRoseAsset, siteLat: number, siteLon: number): WindStationPick | null {
  const ranked = rankWindStations(asset, siteLat, siteLon);
  if (!ranked.length) return null;
  const rule = referenceStationRule(siteLat, siteLon);
  const reference = rule ? ranked.find((r) => r.station.id === rule.stationId && isWindStationSane(r.station)) : undefined;
  if (rule && reference) {
    return { ...reference, reason: rule.reason, skippedCloser: skippedCloser(ranked, reference, rule) };
  }
  const chosen =
    ranked.find((r) => r.distanceKm <= WIND_STATION_SEARCH_MAX_KM && isWindStationSane(r.station)) ?? ranked[0]!;
  return { ...chosen, reason: WIND_STATION_REASON_NEAREST, skippedCloser: skippedCloser(ranked, chosen, null) };
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
      years: station.years,
      reason: pick.reason,
      skippedCloser: pick.skippedCloser,
      source: WIND_ROSE_SOURCE,
    },
  };
}

export function stationIdFromZipName(zipName: string): string {
  const match = /(\d{6})_TMYx/.exec(zipName);
  return match?.[1] ?? zipName.replace(/\.zip$/i, "");
}
