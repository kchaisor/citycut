export type PlanViewport = {
  x: number;
  y: number;
  w: number;
  h: number;
};

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

export function planViewportForBounds(
  minE: number,
  minN: number,
  maxE: number,
  maxN: number,
  margin = 0.18,
): PlanViewport {
  const spanE = Math.max(1, maxE - minE);
  const spanN = Math.max(1, maxN - minN);
  const padE = spanE * margin;
  const padN = spanN * margin;
  const extraTop = spanN * 0.1;
  const extraBottom = spanN * 0.14;
  return {
    x: minE - padE,
    y: minN - padN - extraTop,
    w: spanE + padE * 2,
    h: spanN + padN * 2 + extraTop + extraBottom,
  };
}

export function explodedAxoViewportExtent(bounds: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): PlanViewport {
  return {
    x: bounds.minX,
    y: bounds.minY,
    w: bounds.maxX - bounds.minX,
    h: bounds.maxY - bounds.minY,
  };
}
