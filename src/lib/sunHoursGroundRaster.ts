import { sunHoursGroundRgba } from "./sunHoursGround";
import type { SunHoursGroundGrid } from "./sunHoursGroundPlan";

export type SunHoursGroundRaster = {
  href: string;
  east: number;
  north: number;
  widthM: number;
  heightM: number;
  cellCount: number;
};

export function rasterizeSunHoursGroundGrid(
  grid: SunHoursGroundGrid,
  opacity = 0.86,
  scaleMaxHours = grid.maxSunHours,
): SunHoursGroundRaster | null {
  const { cellM, originEast, originNorth, cols, rows, sunHours, masked } = grid;
  if (cols <= 0 || rows <= 0 || scaleMaxHours <= 0) return null;
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
  const image = ctx.createImageData(widthPx, heightPx);
  const scaleX = widthPx / widthM;
  const scaleY = heightPx / heightM;
  let cellCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const isMasked = Boolean(masked[index]);
      const hours = sunHours[index]!;
      const rgba = sunHoursGroundRgba(hours, scaleMaxHours, isMasked);
      if (rgba[3] === 0) continue;
      cellCount += 1;
      const canvasRow = rows - 1 - row;
      const x0 = Math.floor(col * cellM * scaleX);
      const y0 = Math.floor(canvasRow * cellM * scaleY);
      const x1 = Math.ceil((col + 1) * cellM * scaleX);
      const y1 = Math.ceil((canvasRow + 1) * cellM * scaleY);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const px = (y * widthPx + x) * 4;
          image.data[px] = rgba[0]!;
          image.data[px + 1] = rgba[1]!;
          image.data[px + 2] = rgba[2]!;
          image.data[px + 3] = Math.round(rgba[3]! * opacity);
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  const href = canvas.toDataURL("image/png");
  return { href, east: originEast, north: originNorth, widthM, heightM, cellCount };
}

export function rasterizeSunHoursGroundGridFor3d(
  grid: SunHoursGroundGrid,
  scaleMaxHours = grid.maxSunHours,
): HTMLCanvasElement | null {
  const { cols, rows, sunHours, masked } = grid;
  if (cols <= 0 || rows <= 0 || scaleMaxHours <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(cols, rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const canvasRow = rows - 1 - row;
      const px = (canvasRow * cols + col) * 4;
      const rgba = sunHoursGroundRgba(sunHours[index]!, scaleMaxHours, Boolean(masked[index]));
      image.data.set(rgba, px);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
