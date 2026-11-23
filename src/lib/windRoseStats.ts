import {
  sectorCenterDeg,
  sectorIndex,
  sectorLabel,
  type WindPeriodId,
  type WindPeriodStats,
} from "./windRose";
import {
  type SiteWindSelection,
  type WindRose,
  type WindRoseDaypartRecord,
  type WindRoseSeasonId,
  type WindRoseSeasonRecord,
  WIND_SPEED_BIN_EDGES_MS,
} from "./windRoseData";
import { speedBinMidMs } from "./windRoseEpw";
import type { WindDaypartId } from "./windDayparts";

export function seasonDaypart(record: WindRoseSeasonRecord, daypart: WindDaypartId = "all"): WindRoseDaypartRecord | null {
  if (daypart === "all") {
    const { morning: _morning, afternoon: _afternoon, ...allDay } = record;
    return allDay;
  }
  return record[daypart] ?? null;
}

export function seasonRecord(
  selection: SiteWindSelection,
  period: WindPeriodId,
  daypart: WindDaypartId = "all",
): WindRoseDaypartRecord | null {
  if (period.startsWith("month-")) return null;
  const rec = selection.asset.stations.find((s) => s.id === selection.station.id);
  if (!rec) return null;
  return seasonDaypart(rec.seasons[period as WindRoseSeasonId], daypart);
}

export function buildWindRose(
  selection: SiteWindSelection,
  period: WindPeriodId,
  daypart: WindDaypartId = "all",
): WindRose | null {
  if (period.startsWith("month-")) return null;
  const record = seasonRecord(selection, period, daypart);
  if (!record) return null;
  const edges = selection.asset.speedBinEdgesMs;
  return {
    station: selection.station,
    season: period as WindRoseSeasonId,
    sectors: record.sectors.map((speedBins, sector) => ({
      dirDeg: sectorCenterDeg(sector),
      speedBins,
    })),
    calmPct: record.calmPct,
    speedBinEdgesMs: edges,
    prevailingDirDeg: record.prevailingDirDeg,
    meanSpeedMs: record.meanSpeedMs,
  };
}

export function analyzeSiteWind(
  selection: SiteWindSelection,
  period: WindPeriodId,
  daypart: WindDaypartId = "all",
): WindPeriodStats | null {
  const record = seasonRecord(selection, period, daypart);
  if (!record) return null;
  const sectorTotals = record.sectors.map((bins) => bins.reduce((a, b) => a + b, 0));
  const windyHoursFrac = sectorTotals.reduce((a, b) => a + b, 0);
  const prevailingSector = sectorIndex(record.prevailingDirDeg);
  const meanKmh = record.meanSpeedMs * 3.6;

  return {
    period,
    totalHours: 1,
    calmHours: record.calmPct / 100,
    calmPercent: record.calmPct,
    sectorFrequency: sectorTotals.map((f) => (windyHoursFrac > 0 ? f / windyHoursFrac : 0)),
    prevailingSector,
    prevailingLabel: sectorLabel(prevailingSector, true),
    prevailingMedianKmh: meanKmh,
    prevailingMeanSpeedMs: record.meanSpeedMs,
    sectorSpeedBins: record.sectors,
    speedBinEdgesMs: selection.asset.speedBinEdgesMs,
  };
}

export function maxSectorFrequency(stats: WindPeriodStats): number {
  return Math.max(...stats.sectorFrequency, 0.001);
}

export function stackedSectorArmLength(stats: WindPeriodStats, sector: number): number {
  const bins = stats.sectorSpeedBins?.[sector];
  if (!bins) return stats.sectorFrequency[sector] ?? 0;
  return bins.reduce((a, b) => a + b, 0);
}

export function meanSpeedMsFromRecord(record: WindRoseSeasonRecord, edges: readonly number[] = WIND_SPEED_BIN_EDGES_MS): number {
  let weighted = 0;
  let mass = 0;
  for (const sector of record.sectors) {
    for (let band = 0; band < sector.length; band++) {
      const frac = sector[band] ?? 0;
      if (frac <= 0) continue;
      weighted += frac * speedBinMidMs(band, edges);
      mass += frac;
    }
  }
  return mass > 0 ? weighted / mass : record.meanSpeedMs;
}