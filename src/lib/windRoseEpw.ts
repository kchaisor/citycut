import { sectorCenterDeg, sectorIndex, WIND_SECTOR_COUNT } from "./windRose";
import {
  CALM_SPEED_MS,
  EPW_WIND_DIR_MISSING,
  EPW_WIND_SPEED_MISSING,
  WIND_SPEED_BIN_EDGES_MS,
} from "./windBins";
import { type WindRoseSeasonId, type WindRoseSeasonRecord } from "./windRoseData";

export type EpwHourRow = {
  month: number;
  speedMs: number;
  dirDeg: number;
};

export const SOUTHERN_SEASON_MONTHS: Record<WindRoseSeasonId, number[]> = {
  annual: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  summer: [12, 1, 2],
  autumn: [3, 4, 5],
  winter: [6, 7, 8],
  spring: [9, 10, 11],
};

export function speedBinIndexMs(speedMs: number, edges: readonly number[] = WIND_SPEED_BIN_EDGES_MS): number {
  if (speedMs < edges[0]!) return -1;
  for (let i = 0; i < edges.length - 1; i++) {
    if (speedMs < edges[i + 1]!) return i;
  }
  return edges.length - 2;
}

export function speedBinMidMs(band: number, edges: readonly number[] = WIND_SPEED_BIN_EDGES_MS): number {
  const lo = edges[band]!;
  const hi = edges[band + 1] ?? lo + 20;
  return (lo + hi) / 2;
}

export function parseEpwLocation(line: string): { name: string; lat: number; lon: number; heightM: number } | null {
  if (!line.startsWith("LOCATION,")) return null;
  const parts = line.split(",");
  const lat = Number(parts[6]);
  const lon = Number(parts[7]);
  const heightM = Number(parts[9]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name: parts[1]?.trim() ?? "Unknown",
    lat,
    lon,
    heightM: Number.isFinite(heightM) ? heightM : 10,
  };
}

export function parseEpwPeriodComment(line: string): { periodStart: string; periodEnd: string } | null {
  if (!line.startsWith("COMMENTS 1,")) return null;
  const match = /Period of Record=(\d{4})-(\d{4})/.exec(line);
  if (!match) return null;
  return { periodStart: match[1]!, periodEnd: match[2]! };
}

export function parseEpwDataRow(line: string): EpwHourRow | null {
  const parts = line.split(",");
  if (parts.length < 22) return null;
  const month = Number(parts[1]);
  const speedMs = Number(parts[21]);
  const dirDeg = Number(parts[20]);
  if (month < 1 || month > 12) return null;
  if (!Number.isFinite(speedMs) || !Number.isFinite(dirDeg)) return null;
  if (speedMs >= EPW_WIND_SPEED_MISSING || dirDeg >= EPW_WIND_DIR_MISSING) return null;
  if (speedMs < 0) return null;
  return { month, speedMs, dirDeg };
}

export function aggregateEpwSeason(
  rows: readonly EpwHourRow[],
  season: WindRoseSeasonId,
  edges: readonly number[] = WIND_SPEED_BIN_EDGES_MS,
): WindRoseSeasonRecord {
  const months = new Set(SOUTHERN_SEASON_MONTHS[season]);
  const bandCount = edges.length - 1;
  const counts = Array.from({ length: WIND_SECTOR_COUNT }, () => new Array(bandCount).fill(0));
  let total = 0;
  let calm = 0;
  let speedSum = 0;
  let speedCount = 0;

  for (const row of rows) {
    if (!months.has(row.month)) continue;
    total += 1;
    if (row.speedMs < CALM_SPEED_MS) {
      calm += 1;
      continue;
    }
    speedSum += row.speedMs;
    speedCount += 1;
    const sector = sectorIndex(row.dirDeg);
    const band = speedBinIndexMs(row.speedMs, edges);
    if (band < 0) continue;
    counts[sector]![band]! += 1;
  }

  const sectors: number[][] = [];
  let maxSector = 0;
  let maxSectorCount = -1;
  for (let s = 0; s < WIND_SECTOR_COUNT; s++) {
    const sectorCounts = counts[s]!;
    const sectorSum = sectorCounts.reduce((a, b) => a + b, 0);
    if (sectorSum > maxSectorCount) {
      maxSectorCount = sectorSum;
      maxSector = s;
    }
    const freq = total > 0 ? sectorCounts.map((c) => c / total) : sectorCounts.map(() => 0);
    sectors.push(freq);
  }

  return {
    calmPct: total > 0 ? (calm / total) * 100 : 0,
    prevailingDirDeg: sectorCenterDeg(maxSector),
    meanSpeedMs: speedCount > 0 ? speedSum / speedCount : 0,
    sectors,
  };
}

export function aggregateEpwAllSeasons(rows: readonly EpwHourRow[]): Record<WindRoseSeasonId, WindRoseSeasonRecord> {
  return {
    annual: aggregateEpwSeason(rows, "annual"),
    summer: aggregateEpwSeason(rows, "summer"),
    autumn: aggregateEpwSeason(rows, "autumn"),
    winter: aggregateEpwSeason(rows, "winter"),
    spring: aggregateEpwSeason(rows, "spring"),
  };
}

export function parseEpwWindRows(text: string): { location: ReturnType<typeof parseEpwLocation>; period: ReturnType<typeof parseEpwPeriodComment>; rows: EpwHourRow[] } {
  const lines = text.split(/\r?\n/);
  let location: ReturnType<typeof parseEpwLocation> = null;
  let period: ReturnType<typeof parseEpwPeriodComment> = null;
  const rows: EpwHourRow[] = [];
  let inData = false;
  for (const line of lines) {
    if (!location) location = parseEpwLocation(line);
    if (!period) period = parseEpwPeriodComment(line);
    if (line.startsWith("DATA PERIODS")) {
      inData = true;
      continue;
    }
    if (!inData) continue;
    if (!/^\d{4},/.test(line)) continue;
    const row = parseEpwDataRow(line);
    if (row) rows.push(row);
  }
  return { location, period, rows };
}