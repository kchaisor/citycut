/** Pixels between 1° ticks along the horizon ring below which 5° ticks stay hidden. */
export const DIAL_LOD_MEDIUM_START_PX = 7;
/** Pixels per degree at which 5° ticks reach full opacity. */
export const DIAL_LOD_MEDIUM_FULL_PX = 11;
/** Pixels per degree below which 1° ticks stay hidden. */
export const DIAL_LOD_MINOR_START_PX = 18;
/** Pixels per degree at which 1° ticks reach full opacity. */
export const DIAL_LOD_MINOR_FULL_PX = 26;
/** Pixels per degree below which inner altitude rings and radials fade out. */
export const DIAL_LOD_INNER_START_PX = 5;
/** Pixels per degree at which inner rings and radials reach full opacity. */
export const DIAL_LOD_INNER_FULL_PX = 9;

/** Smooth 0–1 fade between `start` and `full`. */
export function dialLodFade(pxPerDegree: number, start: number, full: number): number {
  if (!(full > start)) return pxPerDegree >= start ? 1 : 0;
  if (pxPerDegree <= start) return 0;
  if (pxPerDegree >= full) return 1;
  const t = (pxPerDegree - start) / (full - start);
  return t * t * (3 - 2 * t);
}

export type DialTickLod = {
  medium: number;
  minor: number;
  inner: number;
};

/** Opacity multipliers for dial batches at a given ring spacing in screen pixels per degree. */
export function dialTickLodOpacity(pxPerDegree: number): DialTickLod {
  return {
    medium: dialLodFade(pxPerDegree, DIAL_LOD_MEDIUM_START_PX, DIAL_LOD_MEDIUM_FULL_PX),
    minor: dialLodFade(pxPerDegree, DIAL_LOD_MINOR_START_PX, DIAL_LOD_MINOR_FULL_PX),
    inner: dialLodFade(pxPerDegree, DIAL_LOD_INNER_START_PX, DIAL_LOD_INNER_FULL_PX),
  };
}

/** Screen pixels between horizon-ring points one degree apart (same for perspective and ortho). */
export function dialPixelsPerDegree(
  project: (x: number, y: number, z: number) => { x: number; y: number },
  viewWidth: number,
  viewHeight: number,
  ringRadiusM: number,
  groundY: number,
): number {
  const a = project(0, groundY, -ringRadiusM);
  const b = project(
    ringRadiusM * Math.sin((Math.PI / 180) * 1),
    groundY,
    -ringRadiusM * Math.cos((Math.PI / 180) * 1),
  );
  const ax = ((a.x + 1) / 2) * viewWidth;
  const ay = ((1 - a.y) / 2) * viewHeight;
  const bx = ((b.x + 1) / 2) * viewWidth;
  const by = ((1 - b.y) / 2) * viewHeight;
  return Math.hypot(bx - ax, by - ay);
}
