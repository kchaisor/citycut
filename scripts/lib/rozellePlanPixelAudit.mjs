import { PNG } from "pngjs";

export const ROZELLE_PLAN_VIEWPORT_FRAC = { x: 0.21, y: 0.08, w: 0.56, h: 0.85 };

export function isCanonicalWaterPixel(r, g, b) {
  return b >= 95 && g >= 85 && r <= 120 && b > g && g > r;
}

export function isBeigeGroundPixel(r, g, b) {
  return r >= 168 && r <= 202 && g >= 162 && g <= 196 && b >= 150 && b <= 188 && Math.abs(r - g) < 12;
}

export function isBlueDominantPixel(r, g, b) {
  return b >= 105 && b >= r + 10 && b >= g - 8;
}

export function isZFightSpecklePixel(r, g, b) {
  return isBlueDominantPixel(r, g, b) && !isCanonicalWaterPixel(r, g, b) && (isBeigeGroundPixel(r, g, b) || (r >= 125 && g >= 125));
}

function isBackgroundPixel(r, g, b) {
  return r + g + b < 40;
}

function rectFromFrac(width, height, outer, inner) {
  const base = {
    x: Math.round(outer.x * width),
    y: Math.round(outer.y * height),
    w: Math.round(outer.w * width),
    h: Math.round(outer.h * height),
  };
  return {
    x: base.x + Math.round(inner.x * base.w),
    y: base.y + Math.round(inner.y * base.h),
    w: Math.round(inner.w * base.w),
    h: Math.round(inner.h * base.h),
  };
}

function tallyRect(png, rect, predicate, skipBackground = true) {
  const W = png.width;
  let hits = 0;
  let total = 0;
  let speckle = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * W + x) * 4;
      if (png.data[i + 3] < 20) continue;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (skipBackground && isBackgroundPixel(r, g, b)) continue;
      total++;
      if (predicate(r, g, b)) hits++;
      if (isZFightSpecklePixel(r, g, b)) speckle++;
    }
  }
  return { hits, total, speckle, frac: total > 0 ? hits / total : 0 };
}

export function auditRozellePlanPngBuffer(buffer) {
  const png = PNG.sync.read(buffer);
  const viewport = rectFromFrac(png.width, png.height, { x: 0, y: 0, w: 1, h: 1 }, ROZELLE_PLAN_VIEWPORT_FRAC);
  const grid = 5;
  let harbourWaterFracBest = 0;
  let harbourBeigeFrac = 0;
  let harbourSpeckleCount = 0;
  let harbourPixels = 0;
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      if (row < 2 || col < 1) continue;
      const tile = {
        x: viewport.x + Math.round((col * viewport.w) / grid),
        y: viewport.y + Math.round((row * viewport.h) / grid),
        w: Math.round(viewport.w / grid),
        h: Math.round(viewport.h / grid),
      };
      const water = tallyRect(png, tile, isCanonicalWaterPixel);
      const beige = tallyRect(png, tile, isBeigeGroundPixel);
      if (water.frac > harbourWaterFracBest) {
        harbourWaterFracBest = water.frac;
        harbourBeigeFrac = beige.frac;
        harbourSpeckleCount = water.speckle;
        harbourPixels = water.total;
      }
    }
  }
  return {
    harbourWaterFrac: harbourWaterFracBest,
    harbourBeigeFrac,
    harbourSpeckleCount,
    harbourPixels,
  };
}

export function rozellePlanPixelPasses(metrics) {
  const waterOk = metrics.harbourWaterFrac >= 0.45;
  const beigeOk = metrics.harbourBeigeFrac <= 0.12;
  const speckleOk = metrics.harbourSpeckleCount <= 1200;
  const ok = waterOk && beigeOk && speckleOk;
  return {
    ok,
    detail: `harbourWater=${(metrics.harbourWaterFrac * 100).toFixed(1)}% harbourBeige=${(metrics.harbourBeigeFrac * 100).toFixed(1)}% speckle=${metrics.harbourSpeckleCount}`,
    waterOk,
    beigeOk,
    speckleOk,
  };
}