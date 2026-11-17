export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };
export type ScreenVec = { x: number; y: number };

export const WIND_ARROW_LENGTH_PX = 44;
export const WIND_ARROW_HEAD_PX = 10;
export const WIND_ARROW_CHIP_GAP_PX = 6;
export const WIND_ARROW_CLEAR_PX = 24;
export const WIND_ARROW_STEP_PX = 8;
export const WIND_ARROW_EDGE_GAP_PX = 4;
export const WIND_ARROW_MAX_INWARD_PX = 240;
export const WIND_ARROW_MARGIN_REACH_PX = 320;

export type WindArrowLayout = {
  tail: ScreenVec;
  head: ScreenVec;
  chip: ScreenRect;
  bounds: ScreenRect;
  clear: boolean;
};

export function unit(v: ScreenVec): ScreenVec {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect, gap = 0): boolean {
  return a.x0 - gap < b.x1 && b.x0 < a.x1 + gap && a.y0 - gap < b.y1 && b.y0 < a.y1 + gap;
}

export function windArrowRelative(downwind: ScreenVec, chipW: number, chipH: number): Omit<WindArrowLayout, "clear"> {
  const d = unit(downwind);
  const tail = { x: 0, y: 0 };
  const head = { x: d.x * WIND_ARROW_LENGTH_PX, y: d.y * WIND_ARROW_LENGTH_PX };
  const reach = Math.abs(d.x) * (chipW / 2) + Math.abs(d.y) * (chipH / 2) + WIND_ARROW_CHIP_GAP_PX;
  const cx = -d.x * reach;
  const cy = -d.y * reach;
  const chip = { x0: cx - chipW / 2, y0: cy - chipH / 2, x1: cx + chipW / 2, y1: cy + chipH / 2 };
  const half = WIND_ARROW_HEAD_PX / 2;
  const back = { x: head.x - d.x * WIND_ARROW_HEAD_PX, y: head.y - d.y * WIND_ARROW_HEAD_PX };
  const points = [head, ...[tail, back].flatMap((p) => [
    { x: p.x - d.y * half, y: p.y + d.x * half },
    { x: p.x + d.y * half, y: p.y - d.x * half },
  ])];
  const bounds = {
    x0: Math.min(chip.x0, ...points.map((p) => p.x)),
    y0: Math.min(chip.y0, ...points.map((p) => p.y)),
    x1: Math.max(chip.x1, ...points.map((p) => p.x)),
    y1: Math.max(chip.y1, ...points.map((p) => p.y)),
  };
  return { tail, head, chip, bounds };
}

function shift(rect: ScreenRect, by: ScreenVec): ScreenRect {
  return { x0: rect.x0 + by.x, y0: rect.y0 + by.y, x1: rect.x1 + by.x, y1: rect.y1 + by.y };
}

function insideView(box: ScreenRect, view: ScreenRect): boolean {
  return box.x0 >= view.x0 && box.y0 >= view.y0 && box.x1 <= view.x1 && box.y1 <= view.y1;
}

function cross(a: ScreenVec, b: ScreenVec): number {
  return a.x * b.y - a.y * b.x;
}

export type UpwindEdge = { points: ScreenVec[]; lengths: number[]; anchorAt: number };

export function upwindMapEdge(map: readonly ScreenVec[], upwind: ScreenVec): UpwindEdge | null {
  const n = map.length;
  if (n < 3) return null;
  const centre = map.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }), { x: 0, y: 0 });
  const u = unit(upwind);
  const facing: boolean[] = [];
  let hitEdge = -1;
  let hitS = 0;
  let hitT = Infinity;
  for (let k = 0; k < n; k++) {
    const a = map[k]!;
    const b = map[(k + 1) % n]!;
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const mid = { x: (a.x + b.x) / 2 - centre.x, y: (a.y + b.y) / 2 - centre.y };
    let normal = unit({ x: edge.y, y: -edge.x });
    if (normal.x * mid.x + normal.y * mid.y < 0) normal = { x: -normal.x, y: -normal.y };
    facing.push(normal.x * u.x + normal.y * u.y > 0.05);
    const denom = cross(u, edge);
    if (Math.abs(denom) < 1e-9) continue;
    const rel = { x: a.x - centre.x, y: a.y - centre.y };
    const t = cross(rel, edge) / denom;
    const s = cross(rel, u) / denom;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t < hitT) {
      hitT = t;
      hitEdge = k;
      hitS = Math.min(1, Math.max(0, s));
    }
  }
  if (hitEdge < 0) return null;
  let first = hitEdge;
  let count = 1;
  facing[hitEdge] = true;
  while (count < n && facing[(first - 1 + n) % n]) {
    first = (first - 1 + n) % n;
    count += 1;
  }
  let last = hitEdge;
  while (count < n && facing[(last + 1) % n] && (last + 1) % n !== first) {
    last = (last + 1) % n;
    count += 1;
  }
  const points: ScreenVec[] = [map[first]!];
  const lengths: number[] = [0];
  let anchorAt = 0;
  for (let c = 0; c < count; c++) {
    const k = (first + c) % n;
    const a = map[k]!;
    const b = map[(k + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (k === hitEdge) anchorAt = lengths[lengths.length - 1]! + len * hitS;
    points.push(b);
    lengths.push(lengths[lengths.length - 1]! + len);
  }
  return { points, lengths, anchorAt };
}

function pointAlong(edge: UpwindEdge, at: number): ScreenVec {
  const { points, lengths } = edge;
  for (let k = 1; k < points.length; k++) {
    if (at > lengths[k]! && k < points.length - 1) continue;
    const a = points[k - 1]!;
    const b = points[k]!;
    const span = lengths[k]! - lengths[k - 1]!;
    const t = span > 0 ? Math.min(1, Math.max(0, (at - lengths[k - 1]!) / span)) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return points[0]!;
}

export function placeWindArrow({
  view,
  map,
  downwind,
  chipW,
  chipH,
  panels,
  buildings = [],
  clearPx = WIND_ARROW_CLEAR_PX,
}: {
  view: ScreenRect;
  map: readonly ScreenVec[];
  downwind: ScreenVec;
  chipW: number;
  chipH: number;
  panels: readonly ScreenRect[];
  buildings?: readonly ScreenRect[];
  clearPx?: number;
}): WindArrowLayout {
  const d = unit(downwind);
  const rel = windArrowRelative(d, chipW, chipH);
  const layoutAt = (tip: ScreenVec, clear: boolean): WindArrowLayout => {
    const anchor = { x: tip.x - rel.head.x, y: tip.y - rel.head.y };
    return {
      tail: { x: rel.tail.x + anchor.x, y: rel.tail.y + anchor.y },
      head: { x: rel.head.x + anchor.x, y: rel.head.y + anchor.y },
      chip: shift(rel.chip, anchor),
      bounds: shift(rel.bounds, anchor),
      clear,
    };
  };
  const edge = upwindMapEdge(map, { x: -d.x, y: -d.y });
  if (!edge) {
    const centre = { x: (view.x0 + view.x1) / 2, y: (view.y0 + view.y1) / 2 };
    return layoutAt(centre, false);
  }
  const total = edge.lengths[edge.lengths.length - 1]!;
  const slides: number[] = [edge.anchorAt];
  for (let k = 1; k * WIND_ARROW_STEP_PX <= total; k++) {
    for (const at of [edge.anchorAt + k * WIND_ARROW_STEP_PX, edge.anchorAt - k * WIND_ARROW_STEP_PX]) {
      if (at >= 0 && at <= total) slides.push(at);
    }
  }
  const tipAt = (at: number, inward: number): ScreenVec => {
    const p = pointAlong(edge, at);
    const offset = inward - WIND_ARROW_EDGE_GAP_PX;
    return { x: p.x + d.x * offset, y: p.y + d.y * offset };
  };
  const boxAt = (tip: ScreenVec) => shift(rel.bounds, { x: tip.x - rel.head.x, y: tip.y - rel.head.y });
  const clearOf = (box: ScreenRect, rects: readonly ScreenRect[]) => rects.every((r) => !rectsOverlap(box, r, clearPx));
  const open = (box: ScreenRect) => insideView(box, view) && clearOf(box, panels);
  for (const at of slides) {
    const tip = tipAt(at, 0);
    const box = boxAt(tip);
    if (open(box) && clearOf(box, buildings)) return layoutAt(tip, true);
  }
  const margin = marginTip(edge, map, rel.bounds, rel.head, view, (box) => open(box) && clearOf(box, buildings));
  if (margin) return layoutAt(margin, true);
  let best: ScreenVec | null = null;
  let bestGap = -Infinity;
  for (let inward = 0; inward <= WIND_ARROW_MAX_INWARD_PX && bestGap < clearPx; inward += WIND_ARROW_STEP_PX) {
    for (const at of slides) {
      const tip = tipAt(at, inward);
      const box = boxAt(tip);
      if (!open(box)) continue;
      const gap = clearance(box, buildings, bestGap, clearPx);
      if (gap > bestGap) {
        best = tip;
        bestGap = gap;
        if (gap >= clearPx) break;
      }
    }
  }
  return layoutAt(best ?? tipAt(edge.anchorAt, 0), false);
}

function rectGap(a: ScreenRect, b: ScreenRect): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
  return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy);
}

function clearance(box: ScreenRect, rects: readonly ScreenRect[], floor: number, cap: number): number {
  let gap = cap;
  for (const r of rects) {
    gap = Math.min(gap, rectGap(box, r));
    if (gap <= floor) return gap;
  }
  return gap;
}

function outsidePolygon(box: ScreenRect, poly: readonly ScreenVec[], gap: number): boolean {
  const boxCorners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  const axes: ScreenVec[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    axes.push(unit({ x: b.y - a.y, y: a.x - b.x }));
  }
  return axes.some((axis) => {
    const proj = (p: ScreenVec) => p.x * axis.x + p.y * axis.y;
    const boxP = boxCorners.map(proj);
    const polyP = poly.map(proj);
    return Math.min(...boxP) >= Math.max(...polyP) + gap || Math.max(...boxP) <= Math.min(...polyP) - gap;
  });
}

function marginTip(
  edge: UpwindEdge,
  map: readonly ScreenVec[],
  bounds: ScreenRect,
  head: ScreenVec,
  view: ScreenRect,
  ok: (box: ScreenRect) => boolean,
): ScreenVec | null {
  const total = edge.lengths[edge.lengths.length - 1]!;
  const ends = [
    { p: edge.points[0]!, far: edge.anchorAt },
    { p: edge.points[edge.points.length - 1]!, far: total - edge.anchorAt },
  ];
  const reach = WIND_ARROW_MARGIN_REACH_PX;
  const candidates: Array<{ tip: ScreenVec; box: ScreenRect; score: number }> = [];
  for (const end of ends) {
    for (let dy = -reach; dy <= reach; dy += WIND_ARROW_STEP_PX) {
      for (let dx = -reach; dx <= reach; dx += WIND_ARROW_STEP_PX) {
        const tip = { x: end.p.x + dx, y: end.p.y + dy };
        const box = shift(bounds, { x: tip.x - head.x, y: tip.y - head.y });
        if (!insideView(box, view) || !outsidePolygon(box, map, WIND_ARROW_EDGE_GAP_PX)) continue;
        const ex = Math.max(box.x0 - end.p.x, end.p.x - box.x1, 0);
        const ey = Math.max(box.y0 - end.p.y, end.p.y - box.y1, 0);
        candidates.push({ tip, box, score: Math.hypot(ex, ey) + end.far * 1e-3 + tip.x * 1e-6 });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.find((c) => ok(c.box))?.tip ?? null;
}
