export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };
export type ScreenVec = { x: number; y: number };

export const WIND_ARROW_LENGTH_PX = 44;
export const WIND_ARROW_HEAD_PX = 10;
export const WIND_ARROW_CHIP_GAP_PX = 6;
export const WIND_ARROW_CLEAR_PX = 24;
export const WIND_ARROW_STEP_PX = 16;
export const WIND_ARROW_ANGLE_STEP_DEG = 7.5;
export const WIND_ARROW_MAX_ANGLE_DEG = 90;

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

function rotate(v: ScreenVec, deg: number): ScreenVec {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
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
  const bounds = {
    x0: Math.min(chip.x0, tail.x - half, head.x - half),
    y0: Math.min(chip.y0, tail.y - half, head.y - half),
    x1: Math.max(chip.x1, tail.x + half, head.x + half),
    y1: Math.max(chip.y1, tail.y + half, head.y + half),
  };
  return { tail, head, chip, bounds };
}

function shift(rect: ScreenRect, by: ScreenVec): ScreenRect {
  return { x0: rect.x0 + by.x, y0: rect.y0 + by.y, x1: rect.x1 + by.x, y1: rect.y1 + by.y };
}

function edgeDistance(view: ScreenRect, centre: ScreenVec, dir: ScreenVec, box: ScreenRect): number {
  let t = Infinity;
  if (dir.x > 1e-9) t = Math.min(t, (view.x1 - box.x1 - centre.x) / dir.x);
  if (dir.x < -1e-9) t = Math.min(t, (view.x0 - box.x0 - centre.x) / dir.x);
  if (dir.y > 1e-9) t = Math.min(t, (view.y1 - box.y1 - centre.y) / dir.y);
  if (dir.y < -1e-9) t = Math.min(t, (view.y0 - box.y0 - centre.y) / dir.y);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

export function placeWindArrow({
  view,
  downwind,
  chipW,
  chipH,
  obstacles,
  clearPx = WIND_ARROW_CLEAR_PX,
}: {
  view: ScreenRect;
  downwind: ScreenVec;
  chipW: number;
  chipH: number;
  obstacles: readonly ScreenRect[];
  clearPx?: number;
}): WindArrowLayout {
  const rel = windArrowRelative(downwind, chipW, chipH);
  const upwind = unit({ x: -downwind.x, y: -downwind.y });
  const centre = { x: (view.x0 + view.x1) / 2, y: (view.y0 + view.y1) / 2 };
  const relCentre = { x: (rel.bounds.x0 + rel.bounds.x1) / 2, y: (rel.bounds.y0 + rel.bounds.y1) / 2 };
  const box = shift(rel.bounds, { x: -relCentre.x, y: -relCentre.y });
  const angles = [0];
  for (let a = WIND_ARROW_ANGLE_STEP_DEG; a <= WIND_ARROW_MAX_ANGLE_DEG; a += WIND_ARROW_ANGLE_STEP_DEG) angles.push(a, -a);
  const rays = angles.map((a) => {
    const dir = rotate(upwind, a);
    return { dir, reach: edgeDistance(view, centre, dir, box) };
  });
  const layoutAt = (boxCentre: ScreenVec, clear: boolean): WindArrowLayout => {
    const anchor = { x: boxCentre.x - relCentre.x, y: boxCentre.y - relCentre.y };
    return {
      tail: { x: rel.tail.x + anchor.x, y: rel.tail.y + anchor.y },
      head: { x: rel.head.x + anchor.x, y: rel.head.y + anchor.y },
      chip: shift(rel.chip, anchor),
      bounds: shift(rel.bounds, anchor),
      clear,
    };
  };
  const maxSteps = Math.max(...rays.map((r) => Math.floor(r.reach / WIND_ARROW_STEP_PX)));
  for (let step = 0; step <= maxSteps; step++) {
    for (const { dir, reach } of rays) {
      const t = reach - step * WIND_ARROW_STEP_PX;
      if (t < 0) continue;
      const at = { x: centre.x + dir.x * t, y: centre.y + dir.y * t };
      const bounds = shift(box, at);
      if (obstacles.every((o) => !rectsOverlap(bounds, o, clearPx))) return layoutAt(at, true);
    }
  }
  const first = rays[0]!;
  return layoutAt({ x: centre.x + first.dir.x * first.reach, y: centre.y + first.dir.y * first.reach }, false);
}
