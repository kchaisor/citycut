export const GROUND_WIND_WINDOW_CSS_PX = 200;
export const GROUND_WIND_WINDOW_STEP_CSS_PX = 100;
export const GROUND_WIND_WINDOW_MIN_GROUND = 0.15;
export const GROUND_WIND_WINDOW_MIN_RATIO = 0.35;

export function groundWindPixelClass(r, g, b) {
  if (b - r > 50 && b > 110) return "trail";
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 14 && r >= 160 && r <= 200) return "ground";
  return "other";
}

export function groundWindDrawnWindows(rgba, width, height, scale = 1, opts = {}) {
  const win = Math.round((opts.windowCssPx ?? GROUND_WIND_WINDOW_CSS_PX) * scale);
  const step = Math.round((opts.stepCssPx ?? GROUND_WIND_WINDOW_STEP_CSS_PX) * scale);
  const minGround = opts.minGround ?? GROUND_WIND_WINDOW_MIN_GROUND;
  const minRatio = opts.minRatio ?? GROUND_WIND_WINDOW_MIN_RATIO;
  const trail = new Uint8Array(width * height);
  const ground = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const cls = groundWindPixelClass(rgba[p], rgba[p + 1], rgba[p + 2]);
    if (cls === "trail") trail[i] = ground[i] = 1;
    else if (cls === "ground") ground[i] = 1;
  }
  const windows = [];
  for (let y0 = 0; y0 + win <= height; y0 += step) {
    for (let x0 = 0; x0 + win <= width; x0 += step) {
      let g = 0;
      let t = 0;
      for (let y = y0; y < y0 + win; y++) {
        const row = y * width;
        for (let x = x0; x < x0 + win; x++) {
          g += ground[row + x];
          t += trail[row + x];
        }
      }
      const groundFrac = g / (win * win);
      if (groundFrac < minGround) continue;
      windows.push({ x0: x0 / scale, y0: y0 / scale, groundFrac, density: t / g, ratio: 0 });
    }
  }
  const sorted = windows.map((w) => w.density).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
  for (const w of windows) w.ratio = median > 0 ? w.density / median : 0;
  const failing = windows.filter((w) => w.ratio < minRatio);
  const worst = windows.reduce((a, w) => (a === null || w.ratio < a.ratio ? w : a), null);
  return { windows, median, worst, failing, ok: windows.length > 0 && median > 0 && failing.length === 0 };
}
