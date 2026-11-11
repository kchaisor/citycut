import { getColour } from "./colours";
import { sunHoursLostColourKey } from "./sunHoursLost";
import type { SunHoursLostGrid } from "./sunHoursLostPlan";

export type SunHoursLostRaster = {
  href: string;
  east: number;
  north: number;
  widthM: number;
  heightM: number;
  cellCount: number;
};

function lossColourCss(hours: number): string | null {
  const key = sunHoursLostColourKey(hours);
  if (!key) return null;
  return getColour(key);
}

export function rasterizeSunHoursLostGrid(grid: SunHoursLostGrid, opacity = 0.82): SunHoursLostRaster | null {
  const { cellM, originEast, originNorth, cols, rows, lossHours } = grid;
  if (cols <= 0 || rows <= 0) return null;
  const widthM = cols * cellM;
  const heightM = rows * cellM;
  const ppm = Math.max(2, Math.min(8, Math.round(4 / cellM)));
  const widthPx = Math.max(1, Math.ceil(widthM * ppm));
  const heightPx = Math.max(1, Math.ceil(heightM * ppm));
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, widthPx, heightPx);
  const scale = widthPx / widthM;
  let cellCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const hours = lossHours[row * cols + col]!;
      const fill = lossColourCss(hours);
      if (!fill) continue;
      cellCount += 1;
      const canvasRow = rows - 1 - row;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.fillRect(col * cellM * scale, canvasRow * cellM * scale, cellM * scale, cellM * scale);
    }
  }
  ctx.globalAlpha = 1;
  const href = canvas.toDataURL("image/png");
  return {
    href,
    east: originEast,
    north: originNorth,
    widthM,
    heightM,
    cellCount,
  };
}
