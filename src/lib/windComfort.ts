import { WIND_SECTOR_COUNT } from "./windRose";
import type { WindRoseSeasonRecord } from "./windRoseData";

// Lawson LDDC criteria as set out in City of London Corporation, "Wind Microclimate Guidelines for
// Developments in the City of London" (2019): comfort uses the mean-hourly speed exceeded no more
// than 5% of the time; safety flags more than 15 m/s for more than 0.022% of the year (about 2 hours).
export const LAWSON_EXCEEDANCE = 0.05;
export const LAWSON_SITTING_MS = 4;
export const LAWSON_STANDING_MS = 6;
export const LAWSON_WALKING_MS = 10;
export const LAWSON_UNSAFE_MS = 15;
export const LAWSON_UNSAFE_EXCEEDANCE = 0.00022;

export const COMFORT_THRESHOLDS_MS = [LAWSON_SITTING_MS, LAWSON_STANDING_MS, LAWSON_WALKING_MS, LAWSON_UNSAFE_MS] as const;

export const COMFORT_CLASSES = ["sitting", "standing", "walking", "uncomfortable", "unsafe"] as const;
export type ComfortClass = (typeof COMFORT_CLASSES)[number];

export const COMFORT_CLASS_LABELS: Record<ComfortClass, string> = {
  sitting: "Sitting",
  standing: "Standing",
  walking: "Walking",
  uncomfortable: "Uncomfortable",
  unsafe: "Unsafe",
};

export type ComfortExceedance = { p4: number; p6: number; p10: number; p15: number };

export function lawsonClass({ p4, p6, p10, p15 }: ComfortExceedance): ComfortClass {
  if (p15 > LAWSON_UNSAFE_EXCEEDANCE) return "unsafe";
  if (p4 <= LAWSON_EXCEEDANCE) return "sitting";
  if (p6 <= LAWSON_EXCEEDANCE) return "standing";
  if (p10 <= LAWSON_EXCEEDANCE) return "walking";
  return "uncomfortable";
}

export type WindSpeedBin = {
  sector: number;
  loMs: number;
  hiMs: number;
  openTop: boolean;
  weight: number;
};

export type WindSeasonWeights = {
  calm: number;
  calmTopMs: number;
  bins: WindSpeedBin[];
};

export function windSeasonWeights(record: WindRoseSeasonRecord, edgesMs: readonly number[]): WindSeasonWeights {
  const bins: WindSpeedBin[] = [];
  let total = Math.max(0, record.calmPct / 100);
  for (let sector = 0; sector < WIND_SECTOR_COUNT; sector++) {
    const freqs = record.sectors[sector] ?? [];
    for (let band = 0; band < freqs.length; band++) {
      const weight = freqs[band] ?? 0;
      if (!(weight > 0)) continue;
      const loMs = edgesMs[band]!;
      const openTop = band + 2 >= edgesMs.length;
      const hiMs = openTop ? loMs + (loMs - (edgesMs[band - 1] ?? 0)) : edgesMs[band + 1]!;
      bins.push({ sector, loMs, hiMs, openTop, weight });
      total += weight;
    }
  }
  if (total <= 0) return { calm: 0, calmTopMs: edgesMs[0] ?? 0, bins: [] };
  for (const bin of bins) bin.weight /= total;
  return { calm: Math.max(0, record.calmPct / 100) / total, calmTopMs: edgesMs[0] ?? 0, bins };
}

// The TMYx top bin is open-ended. Inside a closed bin the speed is spread evenly; above the top
// edge the tail falls off exponentially with a mean excess of one bin width (no invented gusts).
export function binExceedance(bin: Pick<WindSpeedBin, "loMs" | "hiMs" | "openTop">, speedMs: number): number {
  const { loMs, hiMs, openTop } = bin;
  if (speedMs <= loMs) return 1;
  if (openTop) return Math.exp(-(speedMs - loMs) / Math.max(1e-6, hiMs - loMs));
  if (speedMs >= hiMs) return 0;
  return (hiMs - speedMs) / (hiMs - loMs);
}

export function binMeanMs(bin: Pick<WindSpeedBin, "loMs" | "hiMs" | "openTop">): number {
  return bin.openTop ? bin.hiMs : (bin.loMs + bin.hiMs) / 2;
}

export function sectorReferenceSpeedMs(weights: WindSeasonWeights, sector: number): number | null {
  let mass = 0;
  let sum = 0;
  for (const bin of weights.bins) {
    if (bin.sector !== sector) continue;
    mass += bin.weight;
    sum += bin.weight * binMeanMs(bin);
  }
  return mass > 0 ? sum / mass : null;
}

export function exceedanceAt(weights: WindSeasonWeights, ratioOf: (sector: number) => number): ComfortExceedance {
  const out = [0, 0, 0, 0];
  for (const bin of weights.bins) {
    const ratio = ratioOf(bin.sector);
    if (!(ratio > 0)) continue;
    for (let t = 0; t < COMFORT_THRESHOLDS_MS.length; t++) {
      out[t]! += bin.weight * binExceedance(bin, COMFORT_THRESHOLDS_MS[t]! / ratio);
    }
  }
  return { p4: out[0]!, p6: out[1]!, p10: out[2]!, p15: out[3]! };
}

export type ComfortFields = {
  cols: number;
  rows: number;
  p4: Float32Array;
  p6: Float32Array;
  p10: Float32Array;
  p15: Float32Array;
};

export function emptyComfortFields(cols: number, rows: number): ComfortFields {
  const n = cols * rows;
  return { cols, rows, p4: new Float32Array(n), p6: new Float32Array(n), p10: new Float32Array(n), p15: new Float32Array(n) };
}

export function accumulateSectorExceedance(
  fields: ComfortFields,
  weights: WindSeasonWeights,
  sector: number,
  ratio: ArrayLike<number>,
  from = 0,
  to = fields.cols * fields.rows,
  scale = 1,
): void {
  const bins = weights.bins.filter((bin) => bin.sector === sector);
  if (bins.length === 0) return;
  const targets = [fields.p4, fields.p6, fields.p10, fields.p15];
  for (let idx = from; idx < to; idx++) {
    const r = ratio[idx]! * scale;
    if (!(r > 0)) continue;
    for (let t = 0; t < COMFORT_THRESHOLDS_MS.length; t++) {
      const u = COMFORT_THRESHOLDS_MS[t]! / r;
      let p = 0;
      for (const bin of bins) p += bin.weight * binExceedance(bin, u);
      targets[t]![idx]! += p;
    }
  }
}

export function comfortClassAt(fields: ComfortFields, idx: number): ComfortClass {
  return lawsonClass({ p4: fields.p4[idx]!, p6: fields.p6[idx]!, p10: fields.p10[idx]!, p15: fields.p15[idx]! });
}

export function unsafeMask(fields: ComfortFields, solid?: Uint8Array): Uint8Array {
  const mask = new Uint8Array(fields.cols * fields.rows);
  for (let idx = 0; idx < mask.length; idx++) {
    if (solid?.[idx]) continue;
    mask[idx] = fields.p15[idx]! > LAWSON_UNSAFE_EXCEEDANCE ? 1 : 0;
  }
  return mask;
}

export type MaskComponent = { cells: number; minI: number; maxI: number; minJ: number; maxJ: number; sumI: number; sumJ: number };

// Cells join an area through shared edges only (4-connected): two unsafe cells that touch only at
// a corner count as two areas.
export function maskComponents(mask: Uint8Array, cols: number, rows: number): MaskComponent[] {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const components: MaskComponent[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const c: MaskComponent = { cells: 0, minI: Infinity, maxI: -Infinity, minJ: Infinity, maxJ: -Infinity, sumI: 0, sumJ: 0 };
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const i = idx % cols;
      const j = (idx - i) / cols;
      c.cells += 1;
      c.minI = Math.min(c.minI, i);
      c.maxI = Math.max(c.maxI, i);
      c.minJ = Math.min(c.minJ, j);
      c.maxJ = Math.max(c.maxJ, j);
      c.sumI += i;
      c.sumJ += j;
      const visit = (n: number) => {
        if (mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      };
      if (i > 0) visit(idx - 1);
      if (i + 1 < cols) visit(idx + 1);
      if (j > 0) visit(idx - cols);
      if (j + 1 < rows) visit(idx + cols);
    }
    components.push(c);
  }
  return components;
}

export function countUnsafeAreas(mask: Uint8Array, cols: number, rows: number): number {
  return maskComponents(mask, cols, rows).length;
}

export function unsafeAreasLabel(count: number): string {
  if (count <= 0) return "Unsafe: none";
  return count === 1 ? "Unsafe: 1 area" : `Unsafe: ${count} areas`;
}
