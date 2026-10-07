/** On-screen plan viewBox in local east/north metres (Y grows south in SVG). */
export type PlanViewport = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Shared extent for Site plan and Figure-ground so toggling drawing type never
 * changes zoom or pan. Margins fit the figure-ground north arrow and scale bar.
 */
export function planViewportExtent(sideM: number): PlanViewport {
  const half = sideM / 2;
  const padX = sideM * 0.06;
  const padTop = sideM * 0.09;
  const padBottom = sideM * 0.11;
  return {
    x: -half - padX,
    y: -half - padTop,
    w: sideM + padX * 2,
    h: sideM + padTop + padBottom,
  };
}

export function planViewportEqual(a: PlanViewport, b: PlanViewport): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
