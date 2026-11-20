import type { WindPeriodId } from "./windRose";
import type { SiteWindSelection } from "./windRoseData";
import { WIND_ROSE_SOURCE } from "./windRoseData";
import { readableWindStationName } from "./windStationNames";

export function windRoseSourceLine2(): string {
  return "climate.onebuilding.org TMYx";
}

export function formatStationLine1(selection: SiteWindSelection): string {
  const s = selection.station;
  const name = readableWindStationName(s.name, s.id);
  const dist = s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km away` : "—";
  return `${name} · ${dist} · ${s.periodStart}–${s.periodEnd}`;
}

export function windRoseStationCaption(selection: SiteWindSelection, _period: WindPeriodId): string {
  return `${formatStationLine1(selection)} · ${selection.asset.source}`;
}

export function windRoseStationLines(selection: SiteWindSelection): { line1: string; line2: string } {
  return {
    line1: formatStationLine1(selection),
    line2: WIND_ROSE_SOURCE.includes("onebuilding") ? windRoseSourceLine2() : selection.asset.source,
  };
}