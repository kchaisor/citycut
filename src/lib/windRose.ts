/** Compact wind rose table: month × 16 sectors × 5 speed bands, plus calm per month. */

export const WIND_SECTOR_COUNT = 16;
export const WIND_SPEED_BAND_COUNT = 5;
export const WIND_MONTHS = 12;

/** Speed bands in km/h: [0–10), [10–20), [20–30), [30–40), [40+). Calm is under 2 km/h, stored separately. */
export const CALM_SPEED_KMH = 2;

export type WindRoseTable = {
  version: number;
  lat: number;
  lon: number;
  /** Total hourly samples represented in the table. */
  totalHours: number;
  /** counts[month 0–11][sector 0–15][band 0–4] */
  counts: number[][][];
  calmByMonth: number[];
};

export type WindPeriodId =
  | "annual"
  | "summer"
  | "autumn"
  | "winter"
  | "spring"
  | `month-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;

export const WIND_PERIOD_LABELS: Record<Exclude<WindPeriodId, `month-${number}`>, string> = {
  annual: "Annual",
  summer: "Summer (Dec–Feb)",
  autumn: "Autumn (Mar–May)",
  winter: "Winter (Jun–Aug)",
  spring: "Spring (Sep–Nov)",
};

export function monthPeriodLabel(month: number): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[month - 1] ?? `Month ${month}`;
}

/** Meteorological degrees (from north, clockwise). Sector 0 is centred on north. */
export function sectorIndex(fromDeg: number): number {
  const normalized = ((fromDeg % 360) + 360) % 360;
  return Math.floor((normalized + 11.25) / 22.5) % WIND_SECTOR_COUNT;
}

export function sectorCenterDeg(sector: number): number {
  return (sector * 22.5) % 360;
}

export function speedBandIndex(speedKmh: number): number {
  if (speedKmh < 10) return 0;
  if (speedKmh < 20) return 1;
  if (speedKmh < 30) return 2;
  if (speedKmh < 40) return 3;
  return 4;
}

export function emptyWindRoseTable(lat: number, lon: number, version: number): WindRoseTable {
  const counts: number[][][] = [];
  for (let m = 0; m < WIND_MONTHS; m++) {
    const month: number[][] = [];
    for (let s = 0; s < WIND_SECTOR_COUNT; s++) {
      month.push([0, 0, 0, 0, 0]);
    }
    counts.push(month);
  }
  return {
    version,
    lat,
    lon,
    totalHours: 0,
    counts,
    calmByMonth: new Array(WIND_MONTHS).fill(0),
  };
}

/** Aggregate hourly arrays into a table. Raw arrays are not retained. */
export function aggregateHourlyWind(
  lat: number,
  lon: number,
  version: number,
  times: readonly string[],
  speeds: readonly number[],
  directions: readonly number[],
): WindRoseTable {
  const table = emptyWindRoseTable(lat, lon, version);
  const n = Math.min(times.length, speeds.length, directions.length);
  for (let i = 0; i < n; i++) {
    const speed = speeds[i]!;
    const month = parseMonth(times[i]!);
    if (month < 0) continue;
    table.totalHours += 1;
    if (!Number.isFinite(speed) || speed < CALM_SPEED_KMH) {
      table.calmByMonth[month]! += 1;
      continue;
    }
    const dir = directions[i]!;
    if (!Number.isFinite(dir)) {
      table.calmByMonth[month]! += 1;
      continue;
    }
    const sector = sectorIndex(dir);
    const band = speedBandIndex(speed);
    table.counts[month]![sector]![band]! += 1;
  }
  return table;
}

function parseMonth(isoHour: string): number {
  const match = /^(\d{4})-(\d{2})/.exec(isoHour);
  if (!match) return -1;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return -1;
  return month - 1;
}

export function monthsForPeriod(period: WindPeriodId): number[] {
  if (period === "annual") return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  if (period === "summer") return [11, 0, 1];
  if (period === "autumn") return [2, 3, 4];
  if (period === "winter") return [5, 6, 7];
  if (period === "spring") return [8, 9, 10];
  if (period.startsWith("month-")) {
    const month = Number(period.slice("month-".length)) - 1;
    return month >= 0 && month < 12 ? [month] : [];
  }
  return [];
}

export type WindPeriodStats = {
  period: WindPeriodId;
  totalHours: number;
  calmHours: number;
  calmPercent: number;
  /** Frequency per sector (sums to 1 − calmPercent/100 when windy hours exist). */
  sectorFrequency: number[];
  prevailingSector: number;
  prevailingLabel: string;
  /** Median speed (km/h) among windy hours in the prevailing sector. */
  prevailingMedianKmh: number;
};

export const SECTOR_LABELS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function sectorLabel(sector: number, includeSecondary = false): string {
  const primary = SECTOR_LABELS[sector] ?? "?";
  if (!includeSecondary) return primary;
  const secondary = SECTOR_LABELS[(sector + 1) % WIND_SECTOR_COUNT]!;
  return `${primary}, ${secondary}`;
}

export function analyzeWindPeriod(table: WindRoseTable, period: WindPeriodId): WindPeriodStats {
  const months = monthsForPeriod(period);
  const sectorTotals = new Array(WIND_SECTOR_COUNT).fill(0);
  let calmHours = 0;
  let windyHours = 0;
  const prevailingSpeeds: number[] = [];

  for (const month of months) {
    calmHours += table.calmByMonth[month] ?? 0;
    for (let sector = 0; sector < WIND_SECTOR_COUNT; sector++) {
      const bands = table.counts[month]![sector]!;
      const sectorSum = bands.reduce((a, b) => a + b, 0);
      sectorTotals[sector]! += sectorSum;
      windyHours += sectorSum;
    }
  }

  const totalHours = calmHours + windyHours;
  let prevailingSector = 0;
  let max = -1;
  for (let s = 0; s < WIND_SECTOR_COUNT; s++) {
    if (sectorTotals[s]! > max) {
      max = sectorTotals[s]!;
      prevailingSector = s;
    }
  }

  for (const month of months) {
    const bands = table.counts[month]![prevailingSector]!;
    for (let band = 0; band < WIND_SPEED_BAND_COUNT; band++) {
      const count = bands[band]!;
      if (count <= 0) continue;
      const mid = bandMidKmh(band);
      for (let c = 0; c < count; c++) prevailingSpeeds.push(mid);
    }
  }
  prevailingSpeeds.sort((a, b) => a - b);
  const prevailingMedianKmh =
    prevailingSpeeds.length === 0
      ? 0
      : prevailingSpeeds.length % 2 === 1
        ? prevailingSpeeds[(prevailingSpeeds.length - 1) / 2]!
        : (prevailingSpeeds[prevailingSpeeds.length / 2 - 1]! + prevailingSpeeds[prevailingSpeeds.length / 2]!) / 2;

  const sectorFrequency = sectorTotals.map((count) => (windyHours > 0 ? count / windyHours : 0));

  return {
    period,
    totalHours,
    calmHours,
    calmPercent: totalHours > 0 ? (calmHours / totalHours) * 100 : 0,
    sectorFrequency,
    prevailingSector,
    prevailingLabel: sectorLabel(prevailingSector, true),
    prevailingMedianKmh,
  };
}

function bandMidKmh(band: number): number {
  if (band === 0) return 6;
  if (band === 1) return 15;
  if (band === 2) return 25;
  if (band === 3) return 35;
  return 45;
}

/** Downwind unit vector in CityCut ground metres (east, north). Wind direction is where it blows FROM. */
export function downwindEn(fromDeg: number): { east: number; north: number } {
  const rad = (fromDeg * Math.PI) / 180;
  return { east: -Math.sin(rad), north: -Math.cos(rad) };
}

export function downwindFromSector(sector: number): { east: number; north: number } {
  return downwindEn(sectorCenterDeg(sector));
}
