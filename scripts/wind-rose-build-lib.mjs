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
  return { periodStart: match[1], periodEnd: match[2] };
}

export function parseEpwDataRow(line) {
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

export function aggregateEpwSeason(rows, season) {
  const months = new Set(SOUTHERN_SEASON_MONTHS[season]);
  const bandCount = WIND_SPEED_BIN_EDGES_MS.length - 1;
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
  };
}

export function aggregateEpwAllSeasons(rows) {
  return {
    annual: aggregateEpwSeason(rows, "annual"),
    summer: aggregateEpwSeason(rows, "summer"),
    autumn: aggregateEpwSeason(rows, "autumn"),
    winter: aggregateEpwSeason(rows, "winter"),
    spring: aggregateEpwSeason(rows, "spring"),
  };
}

export function stationIdFromZipName(zipName) {
  const match = /(\d{6})_TMYx/.exec(zipName);
  return match?.[1] ?? zipName.replace(/\.zip$/i, "");
}

export function preferTmyxZipName(names) {
  const tmyx = names.filter((n) => /_TMYx/i.test(n) && n.endsWith(".zip"));
  if (!tmyx.length) return null;
  const ranked = (name) => {
    if (name.includes("2009-2023")) return 0;
    if (name.includes("2011-2025")) return 1;
    if (name.includes("2007-2021")) return 2;
    if (/\.(\d{4})-(\d{4})\.zip$/.test(name)) return 3;
    if (/_TMYx\.zip$/i.test(name)) return 4;
    return 5;
  };
  return [...tmyx].sort((a, b) => ranked(a) - ranked(b))[0] ?? null;
}