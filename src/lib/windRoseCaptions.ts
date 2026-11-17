import type { WindPeriodId } from "./windRose";
import type { SiteWindSelection } from "./windRoseData";
import { WIND_ROSE_SOURCE } from "./windRoseData";
import { readableWindStationName } from "./windStationNames";

export function windRoseSourceLine2(): string {
  return "climate.onebuilding.org TMYx";
}

export function formatStationYears(selection: SiteWindSelection): string {
  const s = selection.station;
  const span = `${s.periodStart}–\u2060${s.periodEnd}`;
  return s.years != null ? `${span}\u00a0(${s.years}\u00a0yrs)` : span;
}

export function plainWindCaption(text: string): string {
  return text.replace(/\u2060/g, "").replace(/\u00a0/g, " ");
}

export function formatStationLine1(selection: SiteWindSelection): string {
  const s = selection.station;
  const name = readableWindStationName(s.name, s.id);
  const dist = s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km` : "—";
  return `${name} · ${dist} · ${formatStationYears(selection)}`;
}

export function formatSkippedCloserLine(selection: SiteWindSelection): string {
  const skipped = selection.station.skippedCloser;
  if (!skipped.length) return "";
  const parts = skipped.map((s, i) => {
    const label = `${s.name} ${s.distanceKm.toFixed(1)} km`;
    return skipped[i + 1]?.reason === s.reason ? label : `${label} (${s.reason})`;
  });
  return `Closer: ${parts.join(" · ")}`;
}

export function windRoseStationCaption(selection: SiteWindSelection, _period: WindPeriodId): string {
  return plainWindCaption(`${formatStationLine1(selection)} · ${selection.asset.source}`);
}

export function windRoseStationLines(selection: SiteWindSelection): {
  line1: string;
  skipped: string;
  line2: string;
} {
  return {
    line1: formatStationLine1(selection),
    skipped: formatSkippedCloserLine(selection),
    line2: WIND_ROSE_SOURCE.includes("onebuilding") ? windRoseSourceLine2() : selection.asset.source,
  };
}