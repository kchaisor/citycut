import type { Pt, TerrainField } from "../types";

export type Tri = [Pt, Pt, Pt];

/**
 * Height of the rendered terrain mesh at a plan point: the mesh is the DEM grid from −half at
 * `spacingM` steps, each cell split sw→ne into two planar triangles (see `terrainBuffers`).
 * Unlike the bilinear `sampleTerrain`, this is exactly the surface you see.
 */
export function terrainMeshHeight(field: TerrainField, sideM: number, east: number, north: number): number {
  const half = sideM / 2;
  const s = field.spacingM;
  const fx = Math.min(field.cols - 1, Math.max(0, (east + half) / s));
  const fy = Math.min(field.rows - 1, Math.max(0, (north + half) / s));
  const col = Math.min(field.cols - 2, Math.floor(fx));
  const row = Math.min(field.rows - 2, Math.floor(fy));
  const tx = fx - col;
  const ty = fy - row;
  const at = (c: number, r: number) => field.heights[r * field.cols + c]!;
  const sw = at(col, row);
  const se = at(col + 1, row);
  const nw = at(col, row + 1);
  const ne = at(col + 1, row + 1);
  // Lower triangle (sw, se, ne) when ty <= tx, upper (sw, ne, nw) otherwise.
  return ty <= tx ? sw + tx * (se - sw) + ty * (ne - se) : sw + ty * (nw - sw) + tx * (ne - nw);
}

type Poly = Pt[];

/** Split a convex polygon by the line a·x + b·y = c into (≤ side, ≥ side). */
function splitConvex(poly: Poly, a: number, b: number, c: number): [Poly, Poly] {
  const below: Poly = [];
  const above: Poly = [];
  const eps = 1e-9;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dp = a * p[0] + b * p[1] - c;
    const dq = a * q[0] + b * q[1] - c;
    if (dp <= eps) below.push(p);
    if (dp >= -eps) above.push(p);
    if ((dp < -eps && dq > eps) || (dp > eps && dq < -eps)) {
      const t = dp / (dp - dq);
      const cut: Pt = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      below.push(cut);
      above.push(cut);
    }
  }
  return [below.length >= 3 ? below : [], above.length >= 3 ? above : []];
}

function area2(poly: Poly): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum;
}

/**
 * Cut plan triangles along the terrain mesh's grid lines and cell diagonals, so every output
 * triangle lies inside one planar terrain triangle. Draped with `terrainMeshHeight` plus a lift,
 * each piece is then exactly parallel to the terrain under it: nothing can dip below it, and the
 * count only grows with the cells actually covered (no blanket subdivision).
 */
export function clipTrianglesToTerrainGrid(tris: Tri[], field: TerrainField, sideM: number): Tri[] {
  const half = sideM / 2;
  const s = field.spacingM;
  const maxCol = field.cols - 2;
  const maxRow = field.rows - 2;
  const cellOf = (v: number, max: number) => Math.min(max, Math.max(0, Math.floor((v + half) / s)));
  const out: Tri[] = [];
  const emit = (poly: Poly) => {
    if (poly.length < 3 || Math.abs(area2(poly)) < 1e-6) return;
    const winding = area2(poly) > 0;
    for (let i = 1; i + 1 < poly.length; i++) {
      const tri: Tri = winding ? [poly[0]!, poly[i]!, poly[i + 1]!] : [poly[0]!, poly[i + 1]!, poly[i]!];
      if (Math.abs(area2(tri)) >= 1e-6) out.push(tri);
    }
  };
  for (const tri of tris) {
    const xs = tri.map((p) => p[0]);
    const ys = tri.map((p) => p[1]);
    const c0 = cellOf(Math.min(...xs), maxCol);
    const c1 = cellOf(Math.max(...xs), maxCol);
    const r0 = cellOf(Math.min(...ys), maxRow);
    const r1 = cellOf(Math.max(...ys), maxRow);
    if (c0 === c1 && r0 === r1) {
      // One cell: only the diagonal can cut it.
      const x0 = -half + c0 * s;
      const y0 = -half + r0 * s;
      const [lo, hi] = splitConvex(tri, 1, -1, x0 - y0);
      emit(lo);
      emit(hi);
      continue;
    }
    let rest: Poly = [...tri];
    for (let col = c0; col <= c1 && rest.length >= 3; col++) {
      let column: Poly = rest;
      if (col < c1) {
        const [left, right] = splitConvex(rest, 1, 0, -half + (col + 1) * s);
        column = left;
        rest = right;
      }
      let strip: Poly = column;
      for (let row = r0; row <= r1 && strip.length >= 3; row++) {
        let cell: Poly = strip;
        if (row < r1) {
          const [south, north] = splitConvex(strip, 0, 1, -half + (row + 1) * s);
          cell = south;
          strip = north;
        }
        if (cell.length < 3) continue;
        const x0 = -half + col * s;
        const y0 = -half + row * s;
        const [lo, hi] = splitConvex(cell, 1, -1, x0 - y0);
        emit(lo);
        emit(hi);
      }
    }
  }
  return out;
}
