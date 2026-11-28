export type ContourRing = Float64Array;

export type ContourGrid = {
  values: ArrayLike<number>;
  cols: number;
  rows: number;
};

function nodeValue(grid: ContourGrid, threshold: number, i: number, j: number): number {
  const { cols, rows, values } = grid;
  if (i >= 0 && j >= 0 && i < cols && j < rows) return values[j * cols + i]!;
  const ci = Math.min(cols - 1, Math.max(0, i));
  const cj = Math.min(rows - 1, Math.max(0, j));
  const inner = values[cj * cols + ci]!;
  return inner >= threshold ? Math.min(2 * threshold - inner, threshold - 1e-9) : inner;
}

export function contourRings(grid: ContourGrid, threshold: number): ContourRing[] {
  const { cols, rows } = grid;
  const width = cols + 2;
  const height = rows + 2;
  const inside = new Uint8Array(width * height);
  const value = new Float64Array(width * height);
  for (let j = -1; j <= rows; j++) {
    for (let i = -1; i <= cols; i++) {
      const v = nodeValue(grid, threshold, i, j);
      const k = (j + 1) * width + (i + 1);
      value[k] = v;
      inside[k] = v >= threshold ? 1 : 0;
    }
  }

  const points = new Map<number, [number, number]>();
  const edgeKey = (i: number, j: number, vertical: boolean) => ((j + 1) * width + (i + 1)) * 2 + (vertical ? 1 : 0);
  const crossing = (i: number, j: number, vertical: boolean): number => {
    const key = edgeKey(i, j, vertical);
    if (!points.has(key)) {
      const a = value[(j + 1) * width + (i + 1)]!;
      const b = vertical ? value[(j + 2) * width + (i + 1)]! : value[(j + 1) * width + (i + 2)]!;
      const t = Math.min(1, Math.max(0, (threshold - a) / (b - a)));
      points.set(key, vertical ? [i, j + t] : [i + t, j]);
    }
    return key;
  };

  const segA: number[] = [];
  const segB: number[] = [];
  const addSegment = (a: number, b: number) => {
    segA.push(a);
    segB.push(b);
  };

  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      const k = (j + 1) * width + (i + 1);
      const bl = inside[k]!;
      const br = inside[k + 1]!;
      const tr = inside[k + width + 1]!;
      const tl = inside[k + width]!;
      const code = bl | (br << 1) | (tr << 2) | (tl << 3);
      if (code === 0 || code === 15) continue;
      const bottom = () => crossing(i, j, false);
      const top = () => crossing(i, j + 1, false);
      const left = () => crossing(i, j, true);
      const right = () => crossing(i + 1, j, true);
      switch (code) {
        case 1:
        case 14:
          addSegment(left(), bottom());
          break;
        case 2:
        case 13:
          addSegment(bottom(), right());
          break;
        case 3:
        case 12:
          addSegment(left(), right());
          break;
        case 4:
        case 11:
          addSegment(right(), top());
          break;
        case 6:
        case 9:
          addSegment(bottom(), top());
          break;
        case 7:
        case 8:
          addSegment(left(), top());
          break;
        case 5:
        case 10: {
          const centre = (value[k]! + value[k + 1]! + value[k + width + 1]! + value[k + width]!) / 4;
          const joined = (centre >= threshold) === (code === 5);
          if (joined) {
            addSegment(left(), top());
            addSegment(bottom(), right());
          } else {
            addSegment(left(), bottom());
            addSegment(right(), top());
          }
          break;
        }
      }
    }
  }

  const byKey = new Map<number, number[]>();
  for (let s = 0; s < segA.length; s++) {
    for (const key of [segA[s]!, segB[s]!]) {
      const list = byKey.get(key);
      if (list) list.push(s);
      else byKey.set(key, [s]);
    }
  }

  const used = new Uint8Array(segA.length);
  const rings: ContourRing[] = [];
  for (let start = 0; start < segA.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const firstKey = segA[start]!;
    const keys = [firstKey];
    let current = segB[start]!;
    while (current !== firstKey) {
      keys.push(current);
      const next = byKey.get(current)?.find((s) => !used[s]);
      if (next === undefined) break;
      used[next] = 1;
      current = segA[next] === current ? segB[next]! : segA[next]!;
    }
    if (keys.length < 3) continue;
    const ring = new Float64Array(keys.length * 2);
    keys.forEach((key, n) => {
      const [x, y] = points.get(key)!;
      ring[n * 2] = x;
      ring[n * 2 + 1] = y;
    });
    rings.push(ring);
  }
  return rings;
}

export function smoothRing(ring: ContourRing): ContourRing {
  const n = ring.length / 2;
  if (n < 3) return ring;
  const out = new Float64Array(n * 4);
  for (let p = 0; p < n; p++) {
    const q = (p + 1) % n;
    const ax = ring[p * 2]!;
    const ay = ring[p * 2 + 1]!;
    const bx = ring[q * 2]!;
    const by = ring[q * 2 + 1]!;
    out[p * 4] = 0.75 * ax + 0.25 * bx;
    out[p * 4 + 1] = 0.75 * ay + 0.25 * by;
    out[p * 4 + 2] = 0.25 * ax + 0.75 * bx;
    out[p * 4 + 3] = 0.25 * ay + 0.75 * by;
  }
  return out;
}

export function smoothRingPasses(ring: ContourRing, passes: number): ContourRing {
  let out = ring;
  for (let k = 0; k < passes; k++) out = smoothRing(out);
  return out;
}

export function ringArea(ring: ContourRing): number {
  const n = ring.length / 2;
  let sum = 0;
  for (let p = 0; p < n; p++) {
    const q = (p + 1) % n;
    sum += ring[p * 2]! * ring[q * 2 + 1]! - ring[q * 2]! * ring[p * 2 + 1]!;
  }
  return sum / 2;
}
