export const DIAL_LOD_MEDIUM_START_PX = 7;
export const DIAL_LOD_MEDIUM_FULL_PX = 11;
export const DIAL_LOD_MINOR_START_PX = 18;
export const DIAL_LOD_MINOR_FULL_PX = 26;
export const DIAL_LOD_INNER_START_PX = 5;
export const DIAL_LOD_INNER_FULL_PX = 9;

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

export function dialTickLodOpacity(pxPerDegree: number): DialTickLod {
  return {
    medium: dialLodFade(pxPerDegree, DIAL_LOD_MEDIUM_START_PX, DIAL_LOD_MEDIUM_FULL_PX),
    minor: dialLodFade(pxPerDegree, DIAL_LOD_MINOR_START_PX, DIAL_LOD_MINOR_FULL_PX),
    inner: dialLodFade(pxPerDegree, DIAL_LOD_INNER_START_PX, DIAL_LOD_INNER_FULL_PX),
  };
}

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
