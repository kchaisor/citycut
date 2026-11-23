import { areWindSeasonsSane, isCalmConsistentWithRecent } from "../src/lib/windStationSanity.ts";
import { hourInDaypart } from "../src/lib/windDayparts.ts";

export const WIND_ROSE_SOURCE = "climate.onebuilding.org TMYx EPW";
export const CALM_SPEED_KMH = 2;
export const CALM_SPEED_MS = CALM_SPEED_KMH / 3.6;
export const EPW_WIND_SPEED_MISSING = 999;
export const EPW_WIND_DIR_MISSING = 999;
export const WIND_SPEED_BIN_EDGES_MS = [CALM_SPEED_MS, 10 / 3.6, 20 / 3.6, 30 / 3.6, 40 / 3.6, 100];
export const WIND_SECTOR_COUNT = 16;

export const SOUTHERN_SEASON_MONTHS = {
  annual: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  summer: [12, 1, 2],
  autumn: [3, 4, 5],
  winter: [6, 7, 8],
  spring: [9, 10, 11],
};

export function sectorIndex(fromDeg) {
  const normalized = ((fromDeg % 360) + 360) % 360;
  return Math.floor((normalized + 11.25) / 22.5) % WIND_SECTOR_COUNT;
}

export function sectorCenterDeg(sector) {
  return (sector * 22.5) % 360;
}

export function speedBinIndexMs(speedMs, edges = WIND_SPEED_BIN_EDGES_MS) {
  if (speedMs < edges[0]) return -1;
  for (let i = 0; i < edges.length - 1; i++) {
    if (speedMs < edges[i + 1]) return i;
  }
  return edges.length - 2;
}

export function parseEpwLocation(line) {
  if (!line.startsWith("LOCATION,")) return null;
  const parts = line.split(",");
  const lat = Number(parts[6]);
  const lon = Number(parts[7]);
  const heightM = Number(parts[9]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { name: parts[1]?.trim() ?? "Unknown", lat, lon, heightM: Number.isFinite(heightM) ? heightM : 10 };
}

export function parseEpwPeriodComment(line) {
  if (!line.startsWith("COMMENTS 1,")) return null;
  const match = /Period of Record=(\d{4})-(\d{4})/.exec(line);
  if (!match) return null;
  const years = /#years=\[(\d+)\]/.exec(line);
  return { periodStart: match[1], periodEnd: match[2], years: years ? Number(years[1]) : null };
}

export function parseEpwDataRow(line) {
  const parts = line.split(",");
  if (parts.length < 22) return null;
  const month = Number(parts[1]);
  const hour = Number(parts[3]);
  const speedMs = Number(parts[21]);
  const dirDeg = Number(parts[20]);
  if (month < 1 || month > 12) return null;
  if (hour < 1 || hour > 24) return null;
  if (!Number.isFinite(speedMs) || !Number.isFinite(dirDeg)) return null;
  if (speedMs >= EPW_WIND_SPEED_MISSING || dirDeg >= EPW_WIND_DIR_MISSING) return null;
  if (speedMs < 0) return null;
  return { month, hour, speedMs, dirDeg };
}

export function parseEpwWindRows(text) {
  const lines = text.split(/\r?\n/);
  let location = null;
  let period = null;
  const rows = [];
  let inData = false;
  for (const line of lines) {
    if (!location) location = parseEpwLocation(line);
    if (!period) period = parseEpwPeriodComment(line);
    if (line.startsWith("DATA PERIODS")) {
      inData = true;
      continue;
    }
    if (!inData || !/^\d{4},/.test(line)) continue;
    const row = parseEpwDataRow(line);
    if (row) rows.push(row);
  }
  return { location, period, rows };
}

export function aggregateEpwSeason(rows, season, daypart = "all") {
  const months = new Set(SOUTHERN_SEASON_MONTHS[season]);
  const bandCount = WIND_SPEED_BIN_EDGES_MS.length - 1;
  const counts = Array.from({ length: WIND_SECTOR_COUNT }, () => new Array(bandCount).fill(0));
  let total = 0;
  let calm = 0;
  let speedSum = 0;
  let speedCount = 0;
  const sectorSpeedSums = new Array(WIND_SECTOR_COUNT).fill(0);
  const sectorSpeedCounts = new Array(WIND_SECTOR_COUNT).fill(0);
  for (const row of rows) {
    if (!months.has(row.month)) continue;
    if (!hourInDaypart(row.hour, daypart)) continue;
    total += 1;
    if (row.speedMs < CALM_SPEED_MS) {
      calm += 1;
      continue;
    }
    speedSum += row.speedMs;
    speedCount += 1;
    const sector = sectorIndex(row.dirDeg);
    sectorSpeedSums[sector] += row.speedMs;
    sectorSpeedCounts[sector] += 1;
    const band = speedBinIndexMs(row.speedMs);
    if (band < 0) continue;
    counts[sector][band] += 1;
  }
  let maxSector = 0;
  let maxSectorCount = -1;
  const sectors = [];
  for (let s = 0; s < WIND_SECTOR_COUNT; s++) {
    const sectorCounts = counts[s];
    const sectorSum = sectorCounts.reduce((a, b) => a + b, 0);
    if (sectorSum > maxSectorCount) {
      maxSectorCount = sectorSum;
      maxSector = s;
    }
    sectors.push(total > 0 ? sectorCounts.map((c) => c / total) : sectorCounts.map(() => 0));
  }
  return {
    calmPct: total > 0 ? (calm / total) * 100 : 0,
    prevailingDirDeg: sectorCenterDeg(maxSector),
    meanSpeedMs: speedCount > 0 ? speedSum / speedCount : 0,
    sectors,
    sectorMeanSpeedMs: sectorSpeedSums.map((sum, s) => (sectorSpeedCounts[s] > 0 ? sum / sectorSpeedCounts[s] : 0)),
  };
}

export function aggregateEpwSeasonDayparts(rows, season) {
  return {
    ...aggregateEpwSeason(rows, season, "all"),
    morning: aggregateEpwSeason(rows, season, "morning"),
    afternoon: aggregateEpwSeason(rows, season, "afternoon"),
  };
}

export function aggregateEpwAllSeasons(rows) {
  return {
    annual: aggregateEpwSeasonDayparts(rows, "annual"),
    summer: aggregateEpwSeasonDayparts(rows, "summer"),
    autumn: aggregateEpwSeasonDayparts(rows, "autumn"),
    winter: aggregateEpwSeasonDayparts(rows, "winter"),
    spring: aggregateEpwSeasonDayparts(rows, "spring"),
  };
}

export function stationIdFromZipName(zipName) {
  const match = /(\d{6})_TMYx/.exec(zipName);
  return match?.[1] ?? zipName.replace(/\.zip$/i, "");
}

const DATED_TMYX_ZIP = /_TMYx\.(\d{4})-(\d{4})\.zip$/i;
const FULL_RECORD_TMYX_ZIP = /_TMYx\.zip$/i;

export function orderTmyxCandidates(names) {
  const tmyx = names.filter((n) => FULL_RECORD_TMYX_ZIP.test(n) || DATED_TMYX_ZIP.test(n));
  const datedEnd = (name) => Number(DATED_TMYX_ZIP.exec(name)?.[2] ?? 0);
  const fullRecord = tmyx.filter((n) => FULL_RECORD_TMYX_ZIP.test(n)).sort();
  const dated = tmyx.filter((n) => DATED_TMYX_ZIP.test(n)).sort((a, b) => datedEnd(b) - datedEnd(a));
  return [...fullRecord, ...dated];
}

export function isFullRecordTmyxZip(name) {
  return FULL_RECORD_TMYX_ZIP.test(name);
}

export function mostRecentDatedRecord(candidates) {
  const dated = candidates.filter((c) => DATED_TMYX_ZIP.test(c.zipName));
  const span = (c) => DATED_TMYX_ZIP.exec(c.zipName).slice(1, 3).map(Number);
  dated.sort((a, b) => span(b)[1] - span(a)[1] || span(b)[0] - span(a)[0]);
  return dated[0] ?? null;
}

export function isUsableRecord(candidate, recent) {
  if (!candidate.sane) return false;
  if (!recent?.sane || candidate === recent) return true;
  return isCalmConsistentWithRecent(candidate.seasons, recent.seasons);
}

export function chooseLongestUsableRecord(candidates) {
  if (!candidates.length) return null;
  const recent = mostRecentDatedRecord(candidates);
  const longestFirst = [...candidates].sort(
    (a, b) => (b.years ?? 0) - (a.years ?? 0) || Number(b.periodEnd) - Number(a.periodEnd),
  );
  return longestFirst.find((c) => isUsableRecord(c, recent)) ?? longestFirst[0];
}

export { areWindSeasonsSane, isCalmConsistentWithRecent };

const roundTo = (value, digits) => Number(value.toFixed(digits));
const roundSignificant = (value, digits) => (value === 0 ? 0 : Number(value.toPrecision(digits)));

function compactDaypartRecord(season) {
  return {
    calmPct: season.calmPct,
    prevailingDirDeg: season.prevailingDirDeg,
    meanSpeedMs: season.meanSpeedMs,
    sectors: season.sectors.map((bands) => bands.map((f) => roundSignificant(f, 5))),
    sectorMeanSpeedMs: season.sectorMeanSpeedMs.map((v) => roundTo(v, 2)),
  };
}

export function compactSeasonRecord(season) {
  const compact = compactDaypartRecord(season);
  if (season.morning) compact.morning = compactDaypartRecord(season.morning);
  if (season.afternoon) compact.afternoon = compactDaypartRecord(season.afternoon);
  return compact;
}
