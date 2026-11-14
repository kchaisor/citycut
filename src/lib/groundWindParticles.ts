import type { CityModel } from "../types";
import {
  groundWindCasingAt,
  groundWindCellIndex,
  groundWindInsideFootprint,
  groundWindIsSolid,
  groundWindSpeedAt,
  groundWindVelocityAt,
  type GroundWindField,
  type WindVector,
} from "./groundWindField";
import {
  GROUND_WIND_FAR_X_MAX,
  GROUND_WIND_FAR_Y_MAX,
  GROUND_WIND_FAR_Y_MIN,
  GROUND_WIND_GROUND_Y_MAX,
  GROUND_WIND_GROUND_Y_MIN,
  GROUND_WIND_NEAR_Y_MAX,
  GROUND_WIND_NEAR_Y_MIN,
  GROUND_WIND_REFERENCE_VIEW_H,
  GROUND_WIND_REFERENCE_VIEW_W,
  GROUND_WIND_STREAMLINE_CELL_PX,
  groundWindTargetParticleCount,
} from "./groundWindScreen";
export const GROUND_WIND_TRAIL_POINTS = 28;
export const GROUND_WIND_POINTS_PER_PARTICLE = GROUND_WIND_TRAIL_POINTS + 1;
export const GROUND_WIND_POINT_STRIDE = 8;
export const GROUND_WIND_TRAIL_SAMPLE_S = 1 / 40;
export const GROUND_WIND_PARTICLES_MIN = 520;
export const GROUND_WIND_PARTICLES_MAX = 3200;
export const GROUND_WIND_AREA_PER_PARTICLE_M2 = 380;
export const GROUND_WIND_LIFE_MIN_S = 1.6;
export const GROUND_WIND_LIFE_MAX_S = 3.2;
export const GROUND_WIND_LIFE_FADE_IN_FRAC = 0.1;
export const GROUND_WIND_LIFE_FADE_OUT_FRAC = 0.25;
export const GROUND_WIND_ROAD_SLOT_KEEP = 0.6;
export const GROUND_WIND_WOBBLE = 0.11;
export const GROUND_WIND_TRAIL_LEN_MIN = 8;
export const GROUND_WIND_TRAIL_LEN_MAX = GROUND_WIND_TRAIL_POINTS - 1;
export const GROUND_WIND_CASING_WIDTH_PX = 3;
export const GROUND_WIND_CORE_WIDTH_PX = 1.75;
export const GROUND_WIND_TRAIL_HEAD_ALPHA = 0.9;
export const GROUND_WIND_TRAIL_FAR_MIN_LEN_PX = 32;
export const GROUND_WIND_TRAIL_SCREEN_CAP_PX = 90;
export const GROUND_WIND_TRAIL_MIN_LEN_PX = 36;
export const GROUND_WIND_TRAIL_MAX_LEN_PX = GROUND_WIND_TRAIL_SCREEN_CAP_PX;
export const GROUND_WIND_TRAIL_FAST_MIN_LEN_PX = 48;
export const GROUND_WIND_TRAIL_FAST_MAX_LEN_PX = GROUND_WIND_TRAIL_SCREEN_CAP_PX;
export const GROUND_WIND_SCREEN_MIN_SPACING_PX = GROUND_WIND_STREAMLINE_CELL_PX;
export const GROUND_WIND_STREAMLINE_STOP_PX = 7;
export const GROUND_WIND_TRAIL_LEN_JITTER = 0.35;
export const GROUND_WIND_CURL_NOISE_SCALE_PX = 120;
export const GROUND_WIND_CURL_NOISE_DEG = 4;
export const GROUND_WIND_FAST_SPEED_RATIO = 1.3;
export const GROUND_WIND_RESPAWN_MAX_TRIES = 3;
export const GROUND_WIND_PICK_SPAWN_MAX_ATTEMPTS = 12;

export type HeightAt = (east: number, north: number) => number;

export type GroundWindScreenProject = (east: number, north: number, y: number) => { x: number; y: number } | null;

export type GroundWindScreenUnproject = (screenX: number, screenY: number) => { east: number; north: number } | null;

export type GroundWindParticles = {
  count: number;
  east: Float32Array;
  north: Float32Array;
  age: Float32Array;
  life: Float32Array;
  seed: Float32Array;
  speed: Float32Array;
  screenX: Float32Array;
  screenY: Float32Array;
  history: Float32Array;
  head: Int32Array;
  points: Float32Array;
  sampleClock: number;
  rng: () => number;
  screenProject: GroundWindScreenProject | null;
  screenUnproject: GroundWindScreenUnproject | null;
  viewWidth: number;
  viewHeight: number;
  metresPerPx: number;
  medianKmh: number;
  modelSideM: number;
  cityModel: CityModel | null;
  gridCol: Int16Array;
  gridRow: Int16Array;
  gridCols: number;
  gridRows: number;
  trailLenScale: Float32Array;
  slotSx: Float32Array;
  slotSy: Float32Array;
  slotEast: Float32Array;
  slotNorth: Float32Array;
  layoutCount: number;
  maxCount: number;
  frameClock: number;
  lastDrawnInk: number;
  lastDrawnSegments: number;
  lastDrawnMaxLenPx: number;
  trailLenPx: Float32Array;
};

export type GroundWindStepBench = {
  respawns: number;
  respawnRaycasts: number;
  respawnLoopMax: number;
  advectMs?: number;
  writeMs?: number;
};

export type GroundWindScreenSlot = {
  ci: number;
  cj: number;
  sx: number;
  sy: number;
  east: number;
  north: number;
  far: boolean;
  road: boolean;
};

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(i: number, j: number, salt: number): number {
  let t = (i * 374761393 + j * 668265263 + salt * 1442695041) >>> 0;
  t = Math.imul(t ^ (t >>> 13), t | 1);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

export function groundWindLocalSpeedKmh(speed: number, streamMag: number, medianKmh: number): number {
  const stream = Math.max(0.2, streamMag);
  return medianKmh * (speed / stream);
}

export function groundWindSpeedBand(localKmh: number): 0 | 1 | 2 {
  if (localKmh >= 40) return 2;
  if (localKmh >= 20) return 1;
  return 0;
}

export function groundWindCoreWidthPx(_localKmh: number): number {
  return GROUND_WIND_CORE_WIDTH_PX;
}

export function groundWindMaxTrailWidthPx(): number {
  return GROUND_WIND_CORE_WIDTH_PX;
}

function assignTrailLifePhase(particles: GroundWindParticles, i: number) {
  const life = GROUND_WIND_LIFE_MIN_S + particles.rng() * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
  particles.life[i] = life;
  particles.age[i] = particles.rng() * life;
}

function curlNoiseDeg(sx: number, sy: number, age: number, seed: number): number {
  const s = GROUND_WIND_CURL_NOISE_SCALE_PX;
  const u = sx / s;
  const v = sy / s;
  const t = age * 0.22 + seed;
  const n =
    Math.sin(u * 1.7 + t * 1.3) * Math.cos(v * 1.4 - t * 0.9) +
    Math.sin(u * 0.55 - v * 0.62 + seed) * 0.55;
  return n * GROUND_WIND_CURL_NOISE_DEG;
}

export function groundWindTrailAlpha(along: number): number {
  const t = Math.min(1, Math.max(0, along));
  return GROUND_WIND_TRAIL_HEAD_ALPHA * Math.pow(t, 1.5);
}

export type GroundWindDrawnStrokeSample = {
  ink: number;
  segments: number;
  maxScreenLenPx: number;
};

export function groundWindDrawnInkFromPoints(
  particles: GroundWindParticles,
  _heightAt: HeightAt,
  viewW: number,
  viewH: number,
): GroundWindDrawnStrokeSample {
  if (viewW <= 0 || viewH <= 0 || particles.count <= 0) {
    return { ink: 0, segments: 0, maxScreenLenPx: 0 };
  }
  const { points } = particles;
  const mpp = Math.max(1e-4, particles.metresPerPx);
  let ink = 0;
  let segments = 0;
  let maxScreenLenPx = 0;
  const coreW = GROUND_WIND_CORE_WIDTH_PX;
  const stride = GROUND_WIND_POINT_STRIDE;
  const particleStride = GROUND_WIND_POINTS_PER_PARTICLE * stride;
  for (let i = 0; i < particles.count; i++) {
    let trailLen = 0;
    const base = i * particleStride;
    let prevE = points[base + (GROUND_WIND_TRAIL_POINTS - 1) * stride]!;
    let prevN = -points[base + (GROUND_WIND_TRAIL_POINTS - 1) * stride + 2]!;
    for (let k = GROUND_WIND_TRAIL_POINTS - 2; k >= 0; k--) {
      const off = base + k * stride;
      const alpha = points[off + 3]!;
      if (alpha < 0.01) continue;
      const e = points[off]!;
      const n = -points[off + 2]!;
      const lenPx = Math.hypot(e - prevE, n - prevN) / mpp;
      if (lenPx < 0.2) {
        prevE = e;
        prevN = n;
        continue;
      }
      segments++;
      trailLen += lenPx;
      ink += lenPx * coreW * alpha;
      prevE = e;
      prevN = n;
    }
    if (trailLen > maxScreenLenPx) maxScreenLenPx = trailLen;
  }
  return { ink: ink / (viewW * viewH), segments, maxScreenLenPx };
}

export function groundWindFrameCoverageProxy(particles: GroundWindParticles): number {
  return particles.lastDrawnInk;
}

export function groundWindSeQuarterBalance(
  particles: GroundWindParticles,
  x0 = 600,
  x1 = 1000,
  y0 = 330,
  y1 = 570,
): { left: number; right: number; ratio: number } {
  const mid = (x0 + x1) * 0.5;
  let left = 0;
  let right = 0;
  for (let i = 0; i < particles.count; i++) {
    const sx = particles.screenX[i]!;
    const sy = particles.screenY[i]!;
    if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
  if (lifeEnvelope(particles.age[i]!, particles.life[i]!) < 0.05) continue;
    if (sx < mid) left++;
    else right++;
  }
  const ratio = right > 0 ? left / right : left > 0 ? Number.POSITIVE_INFINITY : 1;
  return { left, right, ratio };
}

export type GroundWindWindowDensitySample = {
  x0: number;
  y0: number;
  groundFrac: number;
  drawnSegments: number;
  drawnLengthPx: number;
  normalised: number;
  ratioToMedian: number;
};

export type GroundWindDrawnWindowRect = {
  x0: number;
  y0: number;
  width: number;
  height: number;
  groundFrac: number;
  drawnSegments: number;
  drawnLengthPx: number;
  groundNormalisedLength: number;
};

export type GroundWindWindowDensityAudit = {
  windowSize: number;
  windowsChecked: number;
  groundRichWindows: number;
  medianNormalised: number;
  minRatioToMedian: number;
  worst: GroundWindWindowDensitySample | null;
  samples: GroundWindWindowDensitySample[];
};

export function groundWindVisibleGroundFractionInRect(
  field: GroundWindField,
  model: CityModel,
  heightAt: HeightAt,
  unproject: GroundWindScreenUnproject,
  project: GroundWindScreenProject,
  x0: number,
  y0: number,
  width: number,
  height: number,
  stepPx = 12,
): number {
  let ground = 0;
  let total = 0;
  for (let sy = y0 + stepPx * 0.5; sy < y0 + height; sy += stepPx) {
    for (let sx = x0 + stepPx * 0.5; sx < x0 + width; sx += stepPx) {
      total++;
      const world = unproject(sx, sy);
      if (!world) continue;
      if (groundWindInsideFootprint(model, world.east, world.north)) continue;
      const idx = groundWindCellIndex(field, world.east, world.north);
      if (idx < 0 || field.solid[idx] === 1) continue;
      const y = heightAt(world.east, world.north);
      const screen = project(world.east, world.north, y);
      if (!screen || screen.x < x0 || screen.x >= x0 + width || screen.y < y0 || screen.y >= y0 + height) continue;
      ground++;
    }
  }
  return total > 0 ? ground / total : 0;
}

export function groundWindVisibleGroundFractionInWindow(
  field: GroundWindField,
  model: CityModel,
  heightAt: HeightAt,
  unproject: GroundWindScreenUnproject,
  project: GroundWindScreenProject,
  x0: number,
  y0: number,
  size: number,
  stepPx = 12,
): number {
  return groundWindVisibleGroundFractionInRect(field, model, heightAt, unproject, project, x0, y0, size, size, stepPx);
}

export function groundWindDrawnScreenStatsInRect(
  particles: GroundWindParticles,
  _heightAt: HeightAt,
  x0: number,
  y0: number,
  width: number,
  height: number,
): { segments: number; lengthPx: number } {
  const project = particles.screenProject;
  if (!project || particles.count <= 0) return { segments: 0, lengthPx: 0 };
  const x1 = x0 + width;
  const y1 = y0 + height;
  const inRect = (sx: number, sy: number) => sx >= x0 && sx < x1 && sy >= y0 && sy < y1;
  const { points } = particles;
  const stride = GROUND_WIND_POINT_STRIDE;
  const particleStride = GROUND_WIND_POINTS_PER_PARTICLE * stride;
  let segments = 0;
  let lengthPx = 0;
  for (let i = 0; i < particles.count; i++) {
    const particleBase = i * particleStride;
    let prev: { x: number; y: number } | null = null;
    for (let k = GROUND_WIND_TRAIL_POINTS - 1; k >= 0; k--) {
      const off = particleBase + k * stride;
      const alpha = points[off + 3]!;
      if (alpha < 0.01) continue;
      const east = points[off]!;
      const north = -points[off + 2]!;
      const y = points[off + 1]!;
      const screen = project(east, north, y);
      if (!screen) continue;
      if (prev) {
        const mx = (prev.x + screen.x) * 0.5;
        const my = (prev.y + screen.y) * 0.5;
        if (inRect(prev.x, prev.y) || inRect(screen.x, screen.y) || inRect(mx, my)) {
          const d = Math.hypot(screen.x - prev.x, screen.y - prev.y);
          if (d > 0.35) {
            segments++;
            lengthPx += d;
          }
        }
      }
      prev = screen;
    }
  }
  return { segments, lengthPx };
}

export function groundWindDrawnSeQuarterBands(
  particles: GroundWindParticles,
  field: GroundWindField,
  model: CityModel,
  heightAt: HeightAt,
  y0 = 330,
  y1 = 570,
): { left: GroundWindDrawnWindowRect; right: GroundWindDrawnWindowRect } {
  const unproject = particles.screenUnproject;
  const project = particles.screenProject;
  const bandH = y1 - y0;
  const bands: Array<{ key: "left" | "right"; x0: number; width: number }> = [
    { key: "left", x0: 600, width: 200 },
    { key: "right", x0: 800, width: 200 },
  ];
  const out = {} as { left: GroundWindDrawnWindowRect; right: GroundWindDrawnWindowRect };
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b]!;
    const groundFrac =
      unproject && project
        ? groundWindVisibleGroundFractionInRect(field, model, heightAt, unproject, project, band.x0, y0, band.width, bandH, 12)
        : 0;
    const drawn = groundWindDrawnScreenStatsInRect(particles, heightAt, band.x0, y0, band.width, bandH);
    const area = Math.max(1, band.width * bandH);
    out[band.key] = {
      x0: band.x0,
      y0,
      width: band.width,
      height: bandH,
      groundFrac,
      drawnSegments: drawn.segments,
      drawnLengthPx: drawn.lengthPx,
      groundNormalisedLength: drawn.lengthPx / (area * Math.max(0.05, groundFrac)),
    };
  }
  return out;
}

export function groundWindFrameWindowDensityAudit(
  particles: GroundWindParticles,
  field: GroundWindField,
  model: CityModel,
  heightAt: HeightAt,
  windowSize = 200,
  minGroundFrac = 0.15,
  step = 100,
  minRatio = 0.35,
): GroundWindWindowDensityAudit {
  const unproject = particles.screenUnproject;
  const project = particles.screenProject;
  const viewW = particles.viewWidth;
  const viewH = particles.viewHeight;
  const samples: GroundWindWindowDensitySample[] = [];
  if (!unproject || !project || viewW <= windowSize || viewH <= windowSize) {
    return {
      windowSize,
      windowsChecked: 0,
      groundRichWindows: 0,
      medianNormalised: 0,
      minRatioToMedian: 0,
      worst: null,
      samples,
    };
  }
  for (let y0 = 0; y0 <= viewH - windowSize; y0 += step) {
    for (let x0 = 0; x0 <= viewW - windowSize; x0 += step) {
      const groundFrac = groundWindVisibleGroundFractionInWindow(field, model, heightAt, unproject, project, x0, y0, windowSize);
      if (groundFrac < minGroundFrac) continue;
      const drawn = groundWindDrawnScreenStatsInRect(particles, heightAt, x0, y0, windowSize, windowSize);
      const normalised = drawn.lengthPx / (windowSize * windowSize * Math.max(0.05, groundFrac));
      samples.push({
        x0,
        y0,
        groundFrac,
        drawnSegments: drawn.segments,
        drawnLengthPx: drawn.lengthPx,
        normalised,
        ratioToMedian: 0,
      });
    }
  }
  const normalised = samples.map((s) => s.normalised).sort((a, b) => a - b);
  const medianNormalised =
    normalised.length === 0
      ? 0
      : normalised.length % 2 === 1
        ? normalised[(normalised.length - 1) / 2]!
        : (normalised[normalised.length / 2 - 1]! + normalised[normalised.length / 2]!) * 0.5;
  let minRatioToMedian = 1;
  let worst: GroundWindWindowDensitySample | null = null;
  for (let i = 0; i < samples.length; i++) {
    const row = samples[i]!;
    const ratioToMedian = medianNormalised > 0 ? row.normalised / medianNormalised : 1;
    row.ratioToMedian = ratioToMedian;
    if (ratioToMedian < minRatioToMedian) {
      minRatioToMedian = ratioToMedian;
      worst = row;
    }
  }
  if (samples.length > 0 && minRatioToMedian < minRatio) worst = worst ?? samples[0]!;
  const windowsChecked = Math.ceil(viewW / step) * Math.ceil(viewH / step);
  return {
    windowSize,
    windowsChecked,
    groundRichWindows: samples.length,
    medianNormalised,
    minRatioToMedian,
    worst,
    samples,
  };
}

export { groundWindTargetParticleCount };

export function groundWindParticleCount(field: GroundWindField): number {
  const areaM2 = field.fluidCells.length * field.cellM * field.cellM;
  return Math.round(Math.min(GROUND_WIND_PARTICLES_MAX, Math.max(GROUND_WIND_PARTICLES_MIN, areaM2 / GROUND_WIND_AREA_PER_PARTICLE_M2)));
}

function alongProfile(k: number, maxK: number): number {
  return maxK > 0 ? k / maxK : 0;
}

export function groundWindPointsLength(count: number): number {
  return count * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
}

function upwindExtent(field: GroundWindField): { minE: number; maxE: number; minN: number; maxN: number } {
  const spanE = field.cols * field.cellM;
  const spanN = field.rows * field.cellM;
  const bx = field.base.east;
  const by = field.base.north;
  const margin = field.cellM * 0.35;
  if (Math.abs(bx) >= Math.abs(by)) {
    return bx >= 0
      ? { minE: field.originE - margin, maxE: field.originE + spanE * 0.42, minN: field.originN, maxN: field.originN + spanN }
      : { minE: field.originE + spanE * 0.58, maxE: field.originE + spanE + margin, minN: field.originN, maxN: field.originN + spanN };
  }
  return by >= 0
    ? { minE: field.originE, maxE: field.originE + spanE, minN: field.originN - margin, maxN: field.originN + spanN * 0.42 }
    : { minE: field.originE, maxE: field.originE + spanE, minN: field.originN + spanN * 0.58, maxN: field.originN + spanN + margin };
}

export function groundWindLowGradient(field: GroundWindField, east: number, north: number): boolean {
  const centre = groundWindSpeedAt(field, east, north);
  if (centre < 0.05) return true;
  const d = field.cellM * 1.15;
  const spread = Math.max(
    Math.abs(centre - groundWindSpeedAt(field, east + d, north)),
    Math.abs(centre - groundWindSpeedAt(field, east - d, north)),
    Math.abs(centre - groundWindSpeedAt(field, east, north + d)),
    Math.abs(centre - groundWindSpeedAt(field, east, north - d)),
  );
  return spread / centre < 0.09;
}

export function groundWindScreenSpacingOk(
  particles: GroundWindParticles,
  index: number,
  sx: number,
  sy: number,
  minPx: number,
): boolean {
  if (particles.count < 2) return true;
  const min2 = minPx * minPx;
  const checks = Math.min(particles.count, 220);
  for (let c = 0; c < checks; c++) {
    const j = (index * 19 + c * 37 + 11) % particles.count;
    if (j === index) continue;
    const dx = particles.screenX[j]! - sx;
    const dy = particles.screenY[j]! - sy;
    if (dx * dx + dy * dy < min2) return false;
  }
  return true;
}

function pickSpawnWorld(
  field: GroundWindField,
  rng: () => number,
  index: number,
  particles: GroundWindParticles,
  heightAt: HeightAt,
  model: CityModel,
): { east: number; north: number; sx: number; sy: number } | null {
  const cell = GROUND_WIND_STREAMLINE_CELL_PX;
  if (particles.screenUnproject && particles.viewWidth > 0 && particles.viewHeight > 0 && particles.gridCols > 0) {
    const ci = particles.gridCol[index]!;
    const cj = particles.gridRow[index]!;
    const anchorSx = particles.slotSx[index]!;
    const anchorSy = particles.slotSy[index]!;
  for (let attempt = 0; attempt < GROUND_WIND_PICK_SPAWN_MAX_ATTEMPTS; attempt++) {
      let sx: number;
      let sy: number;
      if (attempt === 0 && anchorSx > 0 && anchorSy > 0) {
        sx = anchorSx;
        sy = anchorSy;
      } else {
        const jx = hash2D(ci, cj, index + attempt * 5);
        const jy = hash2D(cj, ci, index + attempt * 11);
        sx = Math.min(particles.viewWidth - 6, Math.max(6, (ci + 0.12 + jx * 0.76) * cell));
        sy = Math.min(particles.viewHeight - 6, Math.max(6, (cj + 0.12 + jy * 0.76) * cell));
      }
      const world = particles.screenUnproject(sx, sy);
      if (!world) continue;
      const east = world.east;
      const north = world.north;
      const idx = groundWindCellIndex(field, east, north);
      if (idx < 0 || field.solid[idx] === 1) continue;
      if (groundWindInsideFootprint(model, east, north)) continue;
      const y = heightAt(east, north);
      const screen = particles.screenProject?.(east, north, y);
      if (!screen) continue;
      const uniqueCell = particles.count <= particles.gridCols * particles.gridRows;
      if (!uniqueCell && !groundWindScreenSpacingOk(particles, index, screen.x, screen.y, GROUND_WIND_SCREEN_MIN_SPACING_PX)) continue;
      return { east, north, sx: screen.x, sy: screen.y };
    }
    return null;
  }
  const margin = 28;
  for (let attempt = 0; attempt < GROUND_WIND_PICK_SPAWN_MAX_ATTEMPTS; attempt++) {
    let east: number;
    let north: number;
    if (particles.screenUnproject && particles.viewWidth > 0 && particles.viewHeight > 0) {
      const jx = hash2D(index, attempt, 91);
      const jy = hash2D(index, attempt, 127);
      const sx = margin + jx * (particles.viewWidth - margin * 2);
      const sy = margin + jy * (particles.viewHeight - margin * 2);
      const world = particles.screenUnproject(sx, sy);
      if (!world) continue;
      east = world.east;
      north = world.north;
    } else {
      const band = upwindExtent(field);
      const jx = hash2D(index, attempt, 17);
      const jy = hash2D(index, attempt, 41);
      east = band.minE + jx * (band.maxE - band.minE);
      north = band.minN + jy * (band.maxN - band.minN);
    }
    const idx = groundWindCellIndex(field, east, north);
    if (idx < 0 || field.solid[idx] === 1) continue;
    if (groundWindInsideFootprint(model, east, north)) continue;
    const low = groundWindLowGradient(field, east, north);
    if (low && rng() > 0.38) continue;
    const y = heightAt(east, north);
    const screen = particles.screenProject?.(east, north, y);
    if (!screen) continue;
    if (!groundWindScreenSpacingOk(particles, index, screen.x, screen.y, GROUND_WIND_SCREEN_MIN_SPACING_PX)) continue;
    return { east, north, sx: screen.x, sy: screen.y };
  }
  return null;
}

export function collectVisibleGroundScreenSlots(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  model: CityModel,
  yMin = GROUND_WIND_GROUND_Y_MIN,
  yMax = GROUND_WIND_GROUND_Y_MAX,
): GroundWindScreenSlot[] {
  const cell = GROUND_WIND_STREAMLINE_CELL_PX;
  const w = particles.viewWidth;
  const unproject = particles.screenUnproject;
  const project = particles.screenProject;
  if (!unproject || !project || w <= 0) return [];
  const cols = Math.ceil(w / cell);
  const row0 = Math.max(0, Math.floor(yMin / cell));
  const row1 = Math.min(Math.ceil(particles.viewHeight / cell) - 1, Math.floor(yMax / cell));
  const slots: GroundWindScreenSlot[] = [];
  for (let cj = row0; cj <= row1; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      const sx = (ci + 0.5) * cell;
      const sy = (cj + 0.5) * cell;
      const world = unproject(sx, sy);
      if (!world) continue;
      const east = world.east;
      const north = world.north;
      if (groundWindInsideFootprint(model, east, north)) continue;
      const idx = groundWindCellIndex(field, east, north);
      if (idx < 0 || field.solid[idx] === 1) continue;
      const y = heightAt(east, north);
      const screen = project(east, north, y);
      if (!screen) continue;
      if (screen.y < yMin - 10 || screen.y > yMax + 10) continue;
      const far = screen.x < GROUND_WIND_FAR_X_MAX && screen.y >= GROUND_WIND_FAR_Y_MIN && screen.y <= GROUND_WIND_FAR_Y_MAX;
      const road = groundWindCasingAt(field, east, north);
      slots.push({ ci, cj, sx: screen.x, sy: screen.y, east, north, far, road });
    }
  }
  return slots;
}

function mergeScreenSlots(primary: GroundWindScreenSlot[]): GroundWindScreenSlot[] {
  const min2 = (GROUND_WIND_STREAMLINE_CELL_PX - 1) ** 2;
  const kept: GroundWindScreenSlot[] = [];
  for (let i = 0; i < primary.length; i++) {
    const slot = primary[i]!;
    let ok = true;
    for (let j = 0; j < kept.length; j++) {
      const other = kept[j]!;
      const dx = slot.sx - other.sx;
      const dy = slot.sy - other.sy;
      if (dx * dx + dy * dy < min2) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(slot);
  }
  return kept;
}

function thinRoadSlots(slots: GroundWindScreenSlot[], seed: number): GroundWindScreenSlot[] {
  const rng = seededRandom(seed + 401);
  return slots.filter((s) => !s.road || rng() < GROUND_WIND_ROAD_SLOT_KEEP);
}

function capGroundWindSlotsUniform(slots: GroundWindScreenSlot[], cap: number, seed: number): GroundWindScreenSlot[] {
  if (slots.length <= cap) return slots;
  const ranked = slots.map((slot) => ({
    slot,
    key: hash2D(slot.ci, slot.cj, seed) - (slot.far ? 0.34 : 0),
  }));
  ranked.sort((a, b) => a.key - b.key);
  return ranked.slice(0, cap).map((row) => row.slot);
}

function spawnParticleAtSlot(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  i: number,
  slot: GroundWindScreenSlot,
) {
  const east = slot.east;
  const north = slot.north;
  particles.east[i] = east;
  particles.north[i] = north;
  assignTrailLifePhase(particles, i);
  particles.seed[i] = particles.rng() * Math.PI * 2;
  particles.speed[i] = groundWindSpeedAt(field, east, north);
  particles.head[i] = 0;
  particles.gridCol[i] = slot.ci;
  particles.gridRow[i] = slot.cj;
  particles.slotSx[i] = slot.sx;
  particles.slotSy[i] = slot.sy;
  particles.slotEast[i] = slot.east;
  particles.slotNorth[i] = slot.north;
  particles.screenX[i] = slot.sx;
  particles.screenY[i] = slot.sy;
  const y = heightAt(east, north);
  const base = i * GROUND_WIND_TRAIL_POINTS * 3;
  for (let k = 0; k < GROUND_WIND_TRAIL_POINTS; k++) {
    particles.history[base + k * 3] = east;
    particles.history[base + k * 3 + 1] = north;
    particles.history[base + k * 3 + 2] = y;
  }
}

export function layoutGroundWindScreenSeeds(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  model: CityModel,
  seed = 19,
  slotBudget?: number,
): number {
  particles.cityModel = model;
  const w = particles.viewWidth;
  if (!particles.screenUnproject || w <= 0 || particles.viewHeight <= 0) {
    for (let i = 0; i < particles.count; i++) spawnParticle(particles, field, heightAt, i);
    return particles.count;
  }
  const cell = GROUND_WIND_STREAMLINE_CELL_PX;
  particles.gridCols = Math.ceil(w / cell);
  particles.gridRows = Math.ceil(particles.viewHeight / cell);
  const gathered = collectVisibleGroundScreenSlots(particles, field, heightAt, model);
  const merged = mergeScreenSlots(gathered);
  const roadThinned = thinRoadSlots(merged, seed);
  const cap = Math.min(particles.east.length, slotBudget ?? particles.east.length);
  const slots = capGroundWindSlotsUniform(roadThinned, cap, seed);
  if (slots.length === 0) {
    particles.count = 0;
    particles.layoutCount = 0;
    return 0;
  }
  particles.count = Math.max(GROUND_WIND_PARTICLES_MIN, slots.length);
  if (particles.count > slots.length) particles.count = slots.length;
  particles.layoutCount = particles.count;
  for (let i = 0; i < particles.count; i++) {
    const slot = slots[i]!;
    particles.trailLenScale[i] = 1 - GROUND_WIND_TRAIL_LEN_JITTER + particles.rng() * GROUND_WIND_TRAIL_LEN_JITTER * 2;
    spawnParticleAtSlot(particles, field, heightAt, i, slot);
  }
  refreshGroundWindSlotAnchors(particles, field, heightAt, model);
  return particles.count;
}

function groundWindSlotAnchorFromScreen(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  model: CityModel,
  sx: number,
  sy: number,
): { east: number; north: number; sx: number; sy: number } | null {
  const unproject = particles.screenUnproject;
  const project = particles.screenProject;
  if (!unproject || !project) return null;
  const cell = GROUND_WIND_STREAMLINE_CELL_PX;
  const offsets = [
    [0, 0],
    [cell * 0.34, 0],
    [-cell * 0.34, 0],
    [0, cell * 0.34],
    [0, -cell * 0.34],
    [cell * 0.24, cell * 0.24],
    [-cell * 0.24, cell * 0.24],
  ];
  for (let o = 0; o < offsets.length; o++) {
    const ox = offsets[o]![0]!;
    const oy = offsets[o]![1]!;
    const world = unproject(sx + ox, sy + oy);
    if (!world) continue;
    if (groundWindInsideFootprint(model, world.east, world.north)) continue;
    const idx = groundWindCellIndex(field, world.east, world.north);
    if (idx < 0 || field.solid[idx] === 1) continue;
    const y = heightAt(world.east, world.north);
    const screen = project(world.east, world.north, y);
    if (!screen) continue;
    return { east: world.east, north: world.north, sx: screen.x, sy: screen.y };
  }
  return null;
}

export function refreshGroundWindSlotAnchors(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  model: CityModel,
  bench?: GroundWindStepBench,
) {
  if (!particles.screenUnproject || !particles.screenProject) return;
  for (let i = 0; i < particles.count; i++) {
    const sx = particles.slotSx[i]!;
    const sy = particles.slotSy[i]!;
    if (sx <= 0 || sy <= 0) continue;
    if (bench) bench.respawnRaycasts++;
    const anchored = groundWindSlotAnchorFromScreen(particles, field, heightAt, model, sx, sy);
    if (!anchored) {
      particles.slotEast[i] = 0;
      particles.slotNorth[i] = 0;
      continue;
    }
    particles.slotEast[i] = anchored.east;
    particles.slotNorth[i] = anchored.north;
    particles.slotSx[i] = anchored.sx;
    particles.slotSy[i] = anchored.sy;
  }
}

export function createGroundWindParticles(
  field: GroundWindField,
  heightAt: HeightAt,
  seed = 7,
  points?: Float32Array,
  targetCount?: number,
  cityModel: CityModel | null = null,
): GroundWindParticles {
  const worldCount = groundWindParticleCount(field);
  const count = Math.min(
    GROUND_WIND_PARTICLES_MAX,
    Math.max(GROUND_WIND_PARTICLES_MIN, targetCount ?? worldCount),
  );
  const pointStore = points && points.length >= groundWindPointsLength(count) ? points : new Float32Array(groundWindPointsLength(count));
  const particles: GroundWindParticles = {
    count,
    east: new Float32Array(count),
    north: new Float32Array(count),
    age: new Float32Array(count),
    life: new Float32Array(count),
    seed: new Float32Array(count),
    speed: new Float32Array(count),
    screenX: new Float32Array(count),
    screenY: new Float32Array(count),
    history: new Float32Array(count * GROUND_WIND_TRAIL_POINTS * 3),
    head: new Int32Array(count),
    points: pointStore,
    sampleClock: 0,
    rng: seededRandom(seed),
    screenProject: null,
    screenUnproject: null,
    viewWidth: GROUND_WIND_REFERENCE_VIEW_W,
    viewHeight: GROUND_WIND_REFERENCE_VIEW_H,
    metresPerPx: 0.04,
    medianKmh: 18,
    modelSideM: cityModel?.sideM ?? 320,
    cityModel,
    gridCol: new Int16Array(count),
    gridRow: new Int16Array(count),
    gridCols: 0,
    gridRows: 0,
    trailLenScale: new Float32Array(count),
    slotSx: new Float32Array(count),
    slotSy: new Float32Array(count),
    slotEast: new Float32Array(count),
    slotNorth: new Float32Array(count),
    layoutCount: 0,
    maxCount: count,
    frameClock: 0,
    lastDrawnInk: 0,
    lastDrawnSegments: 0,
    lastDrawnMaxLenPx: 0,
    trailLenPx: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    particles.trailLenScale[i] = 1;
    assignTrailLifePhase(particles, i);
  }
  if (!particles.screenUnproject) {
    for (let i = 0; i < count; i++) spawnParticle(particles, field, heightAt, i);
  }
  return particles;
}

function updateScreenSlot(particles: GroundWindParticles, i: number, east: number, north: number, y: number) {
  const project = particles.screenProject;
  if (!project) return;
  const screen = project(east, north, y);
  if (!screen) return;
  particles.screenX[i] = screen.x;
  particles.screenY[i] = screen.y;
}

function applySpawnPlacement(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  i: number,
  east: number,
  north: number,
  sx: number,
  sy: number,
) {
  const { rng } = particles;
  particles.east[i] = east;
  particles.north[i] = north;
  assignTrailLifePhase(particles, i);
  particles.seed[i] = rng() * Math.PI * 2;
  particles.speed[i] = groundWindSpeedAt(field, east, north);
  particles.head[i] = 0;
  particles.screenX[i] = sx;
  particles.screenY[i] = sy;
  const y = heightAt(east, north);
  const base = i * GROUND_WIND_TRAIL_POINTS * 3;
  for (let k = 0; k < GROUND_WIND_TRAIL_POINTS; k++) {
    particles.history[base + k * 3] = east;
    particles.history[base + k * 3 + 1] = north;
    particles.history[base + k * 3 + 2] = y;
  }
}

function groundWindInsideWorldBounds(particles: GroundWindParticles, east: number, north: number): boolean {
  const half = particles.modelSideM * 0.5;
  const pad = particles.modelSideM * 0.12;
  return east >= -half - pad && east <= half + pad && north >= -half - pad && north <= half + pad;
}

function slotPlacementOk(field: GroundWindField, east: number, north: number): boolean {
  const idx = groundWindCellIndex(field, east, north);
  return idx >= 0 && field.solid[idx] === 0;
}

export function respawnGroundWindParticle(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  i: number,
  bench?: GroundWindStepBench,
) {
  const model = particles.cityModel;
  if (bench) bench.respawns++;
  const sx = particles.slotSx[i]!;
  const sy = particles.slotSy[i]!;
  const east0 = particles.slotEast[i]!;
  const north0 = particles.slotNorth[i]!;
  const cellM = field.cellM;
  const jitters = [0, cellM * 0.32, -cellM * 0.32];
  let tries = 0;
  if (model != null && east0 !== 0 && north0 !== 0 && sx > 0) {
    for (let t = 0; t < GROUND_WIND_RESPAWN_MAX_TRIES; t++) {
      tries++;
      const east = east0 + jitters[t]!;
      const north = north0 + jitters[t]! * 0.15;
      if (!slotPlacementOk(field, east, north)) continue;
      applySpawnPlacement(particles, field, heightAt, i, east, north, sx, sy);
      if (bench) bench.respawnLoopMax = Math.max(bench.respawnLoopMax, tries);
      return;
    }
    if (slotPlacementOk(field, east0, north0)) {
      applySpawnPlacement(particles, field, heightAt, i, east0, north0, sx, sy);
      if (bench) bench.respawnLoopMax = Math.max(bench.respawnLoopMax, tries);
      return;
    }
  }
  spawnFluidParticle(particles, field, heightAt, i);
  if (bench) bench.respawnLoopMax = Math.max(bench.respawnLoopMax, tries);
}

function spawnFluidParticle(particles: GroundWindParticles, field: GroundWindField, heightAt: HeightAt, i: number) {
  const { rng } = particles;
  const cell = field.fluidCells[Math.floor(hash2D(i, particles.frameClock, 3) * field.fluidCells.length)]!;
  const ci = cell % field.cols;
  const cj = Math.floor(cell / field.cols);
  const jx = hash2D(ci, cj, i + 7);
  const jy = hash2D(cj, ci, i + 23);
  const east = field.originE + (ci + jx) * field.cellM;
  const north = field.originN + (cj + jy) * field.cellM;
  particles.east[i] = east;
  particles.north[i] = north;
  assignTrailLifePhase(particles, i);
  particles.seed[i] = rng() * Math.PI * 2;
  particles.speed[i] = groundWindSpeedAt(field, east, north);
  particles.head[i] = 0;
  const y = heightAt(east, north);
  updateScreenSlot(particles, i, east, north, y);
  const base = i * GROUND_WIND_TRAIL_POINTS * 3;
  for (let k = 0; k < GROUND_WIND_TRAIL_POINTS; k++) {
    particles.history[base + k * 3] = east;
    particles.history[base + k * 3 + 1] = north;
    particles.history[base + k * 3 + 2] = y;
  }
}

export function spawnParticle(particles: GroundWindParticles, field: GroundWindField, heightAt: HeightAt, i: number) {
  const { rng } = particles;
  const model = particles.cityModel;
  const placed =
    model != null ? pickSpawnWorld(field, rng, i, particles, heightAt, model) : null;
  let east: number;
  let north: number;
  if (placed) {
    east = placed.east;
    north = placed.north;
    particles.screenX[i] = placed.sx;
    particles.screenY[i] = placed.sy;
  } else {
    const cell = field.fluidCells[Math.floor(hash2D(i, 0, 3) * field.fluidCells.length)]!;
    const ci = cell % field.cols;
    const cj = Math.floor(cell / field.cols);
    const jx = hash2D(ci, cj, i + 7);
    const jy = hash2D(cj, ci, i + 23);
    east = field.originE + (ci + jx) * field.cellM;
    north = field.originN + (cj + jy) * field.cellM;
  }
  particles.east[i] = east;
  particles.north[i] = north;
  assignTrailLifePhase(particles, i);
  particles.seed[i] = rng() * Math.PI * 2;
  particles.speed[i] = groundWindSpeedAt(field, east, north);
  particles.head[i] = 0;
  const y = heightAt(east, north);
  if (!placed) updateScreenSlot(particles, i, east, north, y);
  const base = i * GROUND_WIND_TRAIL_POINTS * 3;
  for (let k = 0; k < GROUND_WIND_TRAIL_POINTS; k++) {
    particles.history[base + k * 3] = east;
    particles.history[base + k * 3 + 1] = north;
    particles.history[base + k * 3 + 2] = y;
  }
}

function pushHistory(particles: GroundWindParticles, i: number, east: number, north: number, y: number) {
  const head = (particles.head[i]! + 1) % GROUND_WIND_TRAIL_POINTS;
  particles.head[i] = head;
  const base = (i * GROUND_WIND_TRAIL_POINTS + head) * 3;
  particles.history[base] = east;
  particles.history[base + 1] = north;
  particles.history[base + 2] = y;
}

export function speedRamp(speed: number): number {
  const t = Math.min(1, Math.max(0, (speed - 0.04) / 1.05));
  return 0.22 + 0.78 * Math.pow(t, 0.55);
}

export function trailVisibleSegments(
  speed: number,
  streamMag: number,
  fast: boolean,
  metresPerPx = 0.04,
  metresPerSecond = 12,
  lenScale = 1,
  headScreenY?: number,
): number {
  const fastStream = fast && speed > streamMag * GROUND_WIND_FAST_SPEED_RATIO;
  let targetPx = fastStream
    ? GROUND_WIND_TRAIL_FAST_MAX_LEN_PX
    : 0.66 * (GROUND_WIND_TRAIL_MIN_LEN_PX + GROUND_WIND_TRAIL_MAX_LEN_PX);
  targetPx = Math.min(GROUND_WIND_TRAIL_SCREEN_CAP_PX, targetPx * Math.max(0.5, Math.min(1.5, lenScale)));
  if (
    headScreenY !== undefined &&
    headScreenY >= GROUND_WIND_FAR_Y_MIN &&
    headScreenY <= GROUND_WIND_FAR_Y_MAX
  ) {
    targetPx = Math.max(targetPx, GROUND_WIND_TRAIL_FAR_MIN_LEN_PX);
  }
  const stepM = Math.max(0.12, metresPerSecond * GROUND_WIND_TRAIL_SAMPLE_S * 1.27);
  const need = Math.ceil((targetPx * Math.max(0.002, metresPerPx)) / stepM);
  const capSeg = Math.max(2, Math.ceil((GROUND_WIND_TRAIL_SCREEN_CAP_PX * Math.max(0.002, metresPerPx)) / stepM));
  const ramp = speedRamp(speed);
  const styleVisible = Math.round(GROUND_WIND_TRAIL_LEN_MIN + ramp * (GROUND_WIND_TRAIL_LEN_MAX - GROUND_WIND_TRAIL_LEN_MIN));
  let lengthSegments = Math.min(capSeg, Math.max(2, need));
  if (fastStream) {
    return Math.min(GROUND_WIND_TRAIL_POINTS - 1, Math.max(lengthSegments, styleVisible), capSeg);
  }
  return Math.min(GROUND_WIND_TRAIL_POINTS - 1, lengthSegments, capSeg);
}

export function groundWindTrailHistorySlots(
  particles: GroundWindParticles,
  index: number,
  visible: number,
): { east: number; north: number }[] {
  const head = particles.head[index]!;
  const out: { east: number; north: number }[] = [];
  for (let k = 0; k < visible; k++) {
    const slot = (head + GROUND_WIND_TRAIL_POINTS - visible + k + 1) % GROUND_WIND_TRAIL_POINTS;
    const h = (index * GROUND_WIND_TRAIL_POINTS + slot) * 3;
    out.push({ east: particles.history[h]!, north: particles.history[h + 1]! });
  }
  out.push({ east: particles.east[index]!, north: particles.north[index]! });
  return out;
}

export function groundWindMaxTrailTurnDeg(pts: { east: number; north: number }[]): number {
  let maxTurn = 0;
  for (let k = 2; k < pts.length; k++) {
    const a = pts[k - 2]!;
    const b = pts[k - 1]!;
    const c = pts[k]!;
    const h1 = Math.atan2(b.north - a.north, b.east - a.east);
    const h2 = Math.atan2(c.north - b.north, c.east - b.east);
    let d = Math.abs(h2 - h1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const deg = d * (180 / Math.PI);
    if (deg > maxTurn) maxTurn = deg;
  }
  return maxTurn;
}

export function groundWindMeanTrailScreenPx(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  project: GroundWindScreenProject,
  metresPerSecond: number,
): number {
  const streamMag = Math.hypot(field.base.east, field.base.north) || 1;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < particles.count; i++) {
    const speed = particles.speed[i]!;
    const fast = speed > streamMag * GROUND_WIND_FAST_SPEED_RATIO;
    const visible = trailVisibleSegments(
      speed,
      streamMag,
      fast,
      particles.metresPerPx,
      metresPerSecond,
      particles.trailLenScale[i] ?? 1,
    );
    const pts = groundWindTrailHistorySlots(particles, i, visible);
    if (pts.length < 2) continue;
    let len = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const ya = heightAt(a.east, a.north);
      const yb = heightAt(b.east, b.north);
      const pa = project(a.east, a.north, ya);
      const pb = project(b.east, b.north, yb);
      if (!pa || !pb) continue;
      len += Math.hypot(pb.x - pa.x, pb.y - pa.y);
    }
    if (len > 0) {
      sum += len;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function groundWindOrthographicProject(
  east: number,
  north: number,
  _y: number,
  viewWidth: number,
  viewHeight: number,
  spanM: number,
): { x: number; y: number } {
  return {
    x: ((east / spanM) + 0.5) * viewWidth,
    y: ((north / spanM) + 0.5) * viewHeight,
  };
}

export function lifeEnvelope(age: number, life: number): number {
  if (life <= 0 || age < 0) return 0;
  const fadeInEnd = life * GROUND_WIND_LIFE_FADE_IN_FRAC;
  const fadeIn = fadeInEnd > 0 ? Math.min(1, age / fadeInEnd) : 1;
  const remain = Math.max(0, life - age);
  const fadeOutEnd = life * GROUND_WIND_LIFE_FADE_OUT_FRAC;
  const fadeOut = fadeOutEnd > 0 ? Math.min(1, remain / fadeOutEnd) : 1;
  return Math.min(1, fadeIn * fadeOut);
}

export function groundWindSeedRowScore(east: Float32Array, north: Float32Array, count: number, cellM: number): number {
  const bins = 24;
  const bucket = new Float32Array(bins * bins);
  for (let i = 0; i < count; i++) {
    const bi = Math.min(bins - 1, Math.max(0, Math.floor(((east[i]! % (cellM * bins)) + cellM * bins) / (cellM * bins) * bins)));
    const bj = Math.min(bins - 1, Math.max(0, Math.floor(((north[i]! % (cellM * bins)) + cellM * bins) / (cellM * bins) * bins)));
    bucket[bj * bins + bi]! += 1;
  }
  let max = 0;
  let total = 0;
  let rowPeaks = 0;
  for (let j = 0; j < bins; j++) {
    let rowMax = 0;
    let rowSum = 0;
    for (let i = 0; i < bins; i++) {
      const v = bucket[j * bins + i]!;
      rowSum += v;
      if (v > rowMax) rowMax = v;
    }
    total += rowSum;
    if (rowSum > 0) rowPeaks += rowMax / rowSum;
    if (rowMax > max) max = rowMax;
  }
  if (total <= 0) return 0;
  const mean = total / (bins * bins);
  return mean > 0 ? (max / mean) * (rowPeaks / bins) : 0;
}

export function groundWindScreenSeedScore(screenX: Float32Array, screenY: Float32Array, count: number): number {
  if (count < 2) return 0;
  let minDist = Number.POSITIVE_INFINITY;
  let sumDist = 0;
  let pairs = 0;
  const samples = Math.min(count, 140);
  for (let i = 0; i < samples; i++) {
    for (let j = i + 1; j < samples; j++) {
      const dx = screenX[i]! - screenX[j]!;
      const dy = screenY[i]! - screenY[j]!;
      const d = Math.hypot(dx, dy);
      if (d < minDist) minDist = d;
      sumDist += d;
      pairs++;
    }
  }
  if (pairs === 0 || minDist < 1) return 0;
  const mean = sumDist / pairs;
  return mean / minDist;
}

const scratch: WindVector = { east: 0, north: 0 };

function capTrailVisibleAndLength(
  particles: GroundWindParticles,
  index: number,
  head: number,
  visible: number,
): { visible: number; trailLenPx: number } {
  if (visible < 2) return { visible, trailLenPx: 0 };
  const mpp = Math.max(1e-4, particles.metresPerPx);
  const capM = GROUND_WIND_TRAIL_SCREEN_CAP_PX * mpp;
  const east = particles.east[index]!;
  const north = particles.north[index]!;
  let prevE = east;
  let prevN = north;
  let accM = 0;
  let capped = 1;
  for (let k = visible - 2; k >= 0; k--) {
    const slot = (head + GROUND_WIND_TRAIL_POINTS - visible + k + 1) % GROUND_WIND_TRAIL_POINTS;
    const h = (index * GROUND_WIND_TRAIL_POINTS + slot) * 3;
    const he = particles.history[h]!;
    const hn = particles.history[h + 1]!;
    accM += Math.hypot(prevE - he, prevN - hn);
    prevE = he;
    prevN = hn;
    capped++;
    if (accM >= capM) break;
  }
  const cappedVisible = Math.max(2, Math.min(visible, capped));
  return { visible: cappedVisible, trailLenPx: accM / mpp };
}

export function stepGroundWindParticles(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  dt: number,
  metresPerSecond: number,
  bench?: GroundWindStepBench,
) {
  particles.frameClock += 1;
  particles.sampleClock += dt;
  let pushes = 0;
  while (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S && pushes < 4) {
    particles.sampleClock -= GROUND_WIND_TRAIL_SAMPLE_S;
    pushes++;
  }
  if (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S) particles.sampleClock = 0;

  const baseMag = Math.hypot(field.base.east, field.base.north) || 1;
  const tAdvect = bench ? performance.now() : 0;
  for (let i = 0; i < particles.count; i++) {
    const e0 = particles.east[i]!;
    const n0 = particles.north[i]!;
    const v2 = groundWindVelocityAt(field, e0, n0, scratch);
    const speed = Math.hypot(v2.east, v2.north);
    const shelterT = Math.min(1, Math.max(0, 1 - speed / (baseMag * 1.1)));
    const wobble =
      Math.sin(particles.age[i]! * 2.7 + particles.seed[i]!) * GROUND_WIND_WOBBLE * (0.35 + shelterT * 1.9) * speed;
    const sx = particles.screenX[i]!;
    const sy = particles.screenY[i]!;
    const curl = (curlNoiseDeg(sx, sy, particles.age[i]!, particles.seed[i]!) * Math.PI) / 180;
    const cosC = Math.cos(curl);
    const sinC = Math.sin(curl);
    const ve = v2.east * cosC - v2.north * sinC;
    const vn = v2.east * sinC + v2.north * cosC;
    const stepM = metresPerSecond * dt * (0.92 + speedRamp(speed) * 0.35);
    const east = e0 + (ve - vn * wobble) * stepM;
    const north = n0 + (vn + ve * wobble) * stepM;
    const age = particles.age[i]! + dt;
    const cell = groundWindCellIndex(field, east, north);
    const outOfWorld = !groundWindInsideWorldBounds(particles, east, north);
    if (cell < 0 || field.solid[cell] === 1 || outOfWorld || age >= particles.life[i]!) {
      respawnGroundWindParticle(particles, field, heightAt, i, bench);
      continue;
    }
    particles.east[i] = east;
    particles.north[i] = north;
    particles.age[i] = age;
    particles.speed[i] = speed;
    if (pushes > 0) {
      const y = heightAt(east, north);
      for (let p = 0; p < pushes; p++) pushHistory(particles, i, east, north, y);
      updateScreenSlot(particles, i, east, north, y);
    }
  }
  if (bench) bench.advectMs = performance.now() - tAdvect;
  const tWrite = bench ? performance.now() : 0;
  if (pushes === 0) {
    writePointsAlphasOnly(particles);
  } else {
    writePoints(particles, heightAt, field, metresPerSecond);
  }
  if (bench) bench.writeMs = performance.now() - tWrite;
}

function writePointsAlphasOnly(particles: GroundWindParticles) {
  const { points } = particles;
  const viewW = particles.viewWidth;
  const viewH = particles.viewHeight;
  let drawnInk = 0;
  let drawnSegments = 0;
  let maxTrailLenPx = 0;
  for (let i = 0; i < particles.count; i++) {
    const env = lifeEnvelope(particles.age[i]!, particles.life[i]!);
    const particleBase = i * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
    const trailLen = particles.trailLenPx[i]!;
    if (env < 0.02 || trailLen <= 0) {
      points[particleBase + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE + 3] = 0;
      continue;
    }
    if (trailLen > maxTrailLenPx) maxTrailLenPx = trailLen;
    for (let k = 0; k < GROUND_WIND_TRAIL_POINTS - 1; k++) {
      const out = particleBase + k * GROUND_WIND_POINT_STRIDE;
      const along = points[out + 4]!;
      if (along <= 0 && points[out + 3]! <= 0) continue;
      const alpha = env * groundWindTrailAlpha(along);
      points[out + 3] = alpha;
      if (alpha > 0.01) drawnSegments++;
    }
    const live = particleBase + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE;
    points[live + 3] = env * GROUND_WIND_TRAIL_HEAD_ALPHA;
    drawnInk += trailLen * GROUND_WIND_CORE_WIDTH_PX * env * 0.62;
  }
  particles.lastDrawnInk = viewW > 0 && viewH > 0 ? drawnInk / (viewW * viewH) : 0;
  particles.lastDrawnSegments = drawnSegments;
  particles.lastDrawnMaxLenPx = maxTrailLenPx;
}

function writePoints(particles: GroundWindParticles, _heightAt: HeightAt, field: GroundWindField, metresPerSecond: number) {
  const { points, history } = particles;
  const streamMag = Math.hypot(field.base.east, field.base.north) || 1;
  const viewW = particles.viewWidth;
  const viewH = particles.viewHeight;
  let drawnInk = 0;
  let drawnSegments = 0;
  let maxTrailLenPx = 0;
  for (let i = 0; i < particles.count; i++) {
    const speed = particles.speed[i]!;
    const env = lifeEnvelope(particles.age[i]!, particles.life[i]!);
    const fast = speed > streamMag * GROUND_WIND_FAST_SPEED_RATIO;
    const band = 0;
    const corePx = GROUND_WIND_CORE_WIDTH_PX;
    const lenScale = particles.trailLenScale[i] ?? 1;
    const head = particles.head[i]!;
    const headSy = particles.screenY[i]!;
    let visible = trailVisibleSegments(
      speed,
      streamMag,
      fast,
      particles.metresPerPx,
      metresPerSecond,
      lenScale,
      headSy,
    );
    const east = particles.east[i]!;
    const north = particles.north[i]!;
    const headSlot = (head + GROUND_WIND_TRAIL_POINTS - 1) % GROUND_WIND_TRAIL_POINTS;
    const yHead = history[(i * GROUND_WIND_TRAIL_POINTS + headSlot) * 3 + 2]!;
    const allowCasing = headSy < GROUND_WIND_NEAR_Y_MIN || headSy > GROUND_WIND_NEAR_Y_MAX;
    const mpp = Math.max(1e-4, particles.metresPerPx);
    const stepM = Math.max(0.12, metresPerSecond * GROUND_WIND_TRAIL_SAMPLE_S * 1.27);
    let trailLenPx = Math.max(0, (visible - 1) * stepM) / mpp;
    if (trailLenPx > GROUND_WIND_TRAIL_SCREEN_CAP_PX + 2) {
      const cap = capTrailVisibleAndLength(particles, i, head, visible);
      visible = cap.visible;
      trailLenPx = cap.trailLenPx;
    } else {
      trailLenPx = Math.min(GROUND_WIND_TRAIL_SCREEN_CAP_PX, trailLenPx);
    }
    const particleBase = i * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
    const maxAlong = Math.max(1, visible - 1);
    for (let k = 0; k < GROUND_WIND_TRAIL_POINTS - 1; k++) {
      const out = particleBase + k * GROUND_WIND_POINT_STRIDE;
      if (k >= visible) {
        points[out] = east;
        points[out + 1] = yHead;
        points[out + 2] = -north;
        points[out + 3] = 0;
        points[out + 4] = 0;
        points[out + 7] = 0;
        continue;
      }
      const slot = (head + GROUND_WIND_TRAIL_POINTS - visible + k + 1) % GROUND_WIND_TRAIL_POINTS;
      const h = (i * GROUND_WIND_TRAIL_POINTS + slot) * 3;
      let segE = history[h]!;
      let segN = history[h + 1]!;
      const segY = history[h + 2]!;
      let alpha = env * groundWindTrailAlpha(alongProfile(k, maxAlong));
      if (groundWindIsSolid(field, segE, segN)) {
        segE = east;
        segN = north;
        alpha = 0;
      }
      points[out] = segE;
      points[out + 1] = segY;
      points[out + 2] = -segN;
      const along = alongProfile(k, maxAlong);
      points[out + 3] = alpha;
      points[out + 4] = along;
      points[out + 5] = band;
      points[out + 6] = corePx;
      points[out + 7] = allowCasing && groundWindCasingAt(field, segE, segN) ? 1 : 0;
    }
    particles.trailLenPx[i] = trailLenPx;
    if (env > 0.02 && trailLenPx > 0.5) {
      drawnSegments += Math.max(1, visible - 1);
      drawnInk += trailLenPx * corePx * env * 0.62;
    }
    if (trailLenPx > maxTrailLenPx) maxTrailLenPx = trailLenPx;
    const live = particleBase + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE;
    points[live] = east;
    points[live + 1] = yHead;
    points[live + 2] = -north;
    points[live + 3] = env * GROUND_WIND_TRAIL_HEAD_ALPHA;
    points[live + 4] = 1;
    points[live + 5] = band;
    points[live + 6] = corePx;
    points[live + 7] = allowCasing && groundWindCasingAt(field, east, north) ? 1 : 0;
    const pad = live + GROUND_WIND_POINT_STRIDE;
    points[pad] = east;
    points[pad + 1] = yHead;
    points[pad + 2] = -north;
    points[pad + 3] = 0;
    points[pad + 4] = 1;
    points[pad + 5] = band;
    points[pad + 6] = corePx;
    points[pad + 7] = 0;
  }
  particles.lastDrawnInk = viewW > 0 && viewH > 0 ? drawnInk / (viewW * viewH) : 0;
  particles.lastDrawnSegments = drawnSegments;
  particles.lastDrawnMaxLenPx = maxTrailLenPx;
}

export function warmGroundWindParticles(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  metresPerSecond: number,
  seconds: number,
) {
  const steps = Math.max(1, Math.round(seconds / GROUND_WIND_TRAIL_SAMPLE_S));
  for (let s = 0; s < steps; s++) {
    stepGroundWindParticles(particles, field, heightAt, GROUND_WIND_TRAIL_SAMPLE_S, metresPerSecond);
  }
}

export function groundWindMetresPerSecond(sideM: number, medianKmh: number | undefined): number {
  const calmKmh = 8;
  const strongKmh = 32;
  const kmh = medianKmh && medianKmh > 0 ? medianKmh : 18;
  const t = Math.min(1, Math.max(0, (kmh - calmKmh) / (strongKmh - calmKmh)));
  const crossS = 14 - t * 5;
  return sideM / crossS;
}
