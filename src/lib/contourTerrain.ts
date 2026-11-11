import type { ContourLayer, TerrainField } from "../types";

export const CONTOUR_TERRAIN_SOURCE = "Vicmap metro contours";

export const PINNABLE_CONTOUR_SOURCES: ReadonlySet<ContourLayer["source"]> = new Set(["vicmap-metro", "cos-1m", "nsw-2m", "cos-nsw"]);

export function contourGroundSourceName(layer: Pick<ContourLayer, "source" | "label">): string {
  return layer.source === "vicmap-metro" ? CONTOUR_TERRAIN_SOURCE : layer.label;
}

export type ContourTerrainResult = {
  field: TerrainField;
  coverage: number;
  demOffsetM: number | null;
  pinned: number;
  iterations: number;
  ms: number;
};

const MAX_NODES = 193;

export function contourTerrain(
  layer: ContourLayer,
  sideM: number,
  base: TerrainField | null,
  options: { farM?: number; maxIterations?: number; tolerance?: number } = {},
): ContourTerrainResult | null {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!PINNABLE_CONTOUR_SOURCES.has(layer.source) || layer.lines.length === 0) return null;
  const cols = base ? base.cols : Math.min(MAX_NODES, Math.max(2, Math.ceil(sideM / 5) + 1));
  const rows = base ? base.rows : cols;
  const dx = sideM / (cols - 1);
  const dy = sideM / (rows - 1);
  const half = sideM / 2;
  const n = cols * rows;
  const sum = new Float64Array(n);
  const count = new Uint32Array(n);

  const step = Math.min(dx, dy) / 2;
  const pin = (e: number, nn: number, z: number) => {
    const c = Math.round((e + half) / dx);
    const r = Math.round((nn + half) / dy);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    sum[r * cols + c] += z;
    count[r * cols + c] += 1;
  };
  for (const line of layer.lines) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ae, an] = pts[i]!;
      const [be, bn] = pts[i + 1]!;
      const parts = Math.max(1, Math.ceil(Math.hypot(be - ae, bn - an) / step));
      for (let k = 0; k <= parts; k++) pin(ae + ((be - ae) * k) / parts, an + ((bn - an) * k) / parts, line.z);
    }
  }
  const fixed = new Uint8Array(n);
  const z = new Float64Array(n);
  let pinned = 0;
  let offsetSum = 0;
  for (let i = 0; i < n; i++) {
    if (count[i]! > 0) {
      fixed[i] = 1;
      z[i] = sum[i]! / count[i]!;
      pinned += 1;
      if (base) offsetSum += z[i]! - base.heights[i]!;
    }
  }
  if (pinned < 3) return null;
  const demOffsetM = base ? offsetSum / pinned : null;

  const dist = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) if (fixed[i]) dist[i] = 0;
  const diag = Math.hypot(dx, dy);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    let d = dist[i]!;
    if (c > 0) d = Math.min(d, dist[i - 1]! + dx);
    if (r > 0) d = Math.min(d, dist[i - cols]! + dy);
    if (r > 0 && c > 0) d = Math.min(d, dist[i - cols - 1]! + diag);
    if (r > 0 && c + 1 < cols) d = Math.min(d, dist[i - cols + 1]! + diag);
    dist[i] = d;
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c;
    let d = dist[i]!;
    if (c + 1 < cols) d = Math.min(d, dist[i + 1]! + dx);
    if (r + 1 < rows) d = Math.min(d, dist[i + cols]! + dy);
    if (r + 1 < rows && c + 1 < cols) d = Math.min(d, dist[i + cols + 1]! + diag);
    if (r + 1 < rows && c > 0) d = Math.min(d, dist[i + cols - 1]! + diag);
    dist[i] = d;
  }

  const farM = options.farM ?? Math.max(60, layer.interval * 15);
  let fallback = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) if (fixed[i]) mean += z[i]!;
  mean /= pinned;
  for (let i = 0; i < n; i++) {
    if (fixed[i]) continue;
    if (base) {
      z[i] = base.heights[i]! + demOffsetM!;
      if (dist[i]! > farM) {
        fixed[i] = 2;
        fallback += 1;
      }
    } else {
      z[i] = mean;
      if (dist[i]! > farM) fallback += 1;
    }
  }

  const maxIterations = options.maxIterations ?? 2000;
  const tolerance = options.tolerance ?? 0.005;
  const omega = 1.85;
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    let change = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (fixed[i]) continue;
      let s = 0;
      let k = 0;
      if (c > 0) { s += z[i - 1]!; k++; }
      if (c + 1 < cols) { s += z[i + 1]!; k++; }
      if (r > 0) { s += z[i - cols]!; k++; }
      if (r + 1 < rows) { s += z[i + cols]!; k++; }
      const next = z[i]! + omega * (s / k - z[i]!);
      change = Math.max(change, Math.abs(next - z[i]!));
      z[i] = next;
    }
    if (change < tolerance) break;
  }

  const heights = new Float32Array(n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    heights[i] = z[i]!;
    if (z[i]! < min) min = z[i]!;
    if (z[i]! > max) max = z[i]!;
  }
  const field: TerrainField = {
    cols,
    rows,
    heights,
    min,
    max,
    spacingM: dx,
    zoom: base?.zoom ?? 0,
    metresPerPixel: base?.metresPerPixel ?? dx,
    source: contourGroundSourceName(layer),
  };
  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { field, coverage: 1 - fallback / n, demOffsetM, pinned, iterations, ms: ended - started };
}

export function contourTerrainNotice(
  result: ContourTerrainResult | null,
  layer: ContourLayer | null,
  hadDem: boolean,
): string | null {
  if (!result) {
    if (!hadDem) return null;
    const why = !layer
      ? "contours were not loaded"
      : PINNABLE_CONTOUR_SOURCES.has(layer.source)
        ? "too few contour lines in the cut"
        : layer.source === "vicmap-state"
          ? "this cut is outside Vicmap metro 1–5 m contour coverage"
          : layer.notes && layer.notes.length > 0
            ? "no NSW contours loaded for this cut"
            : "no Vicmap contours cover this cut";
    return `Ground: Mapterhorn DEM fallback (${why}).`;
  }
  const pct = Math.round(result.coverage * 100);
  if (pct >= 100) return null;
  const name = layer ? contourGroundSourceName(layer) : CONTOUR_TERRAIN_SOURCE;
  return `Ground: ${name} over ${pct}% of the cut; the rest falls back to Mapterhorn DEM.`;
}
