import type { CityModel } from "../types";
import {
  groundWindCellIndex,
  groundWindInsideFootprint,
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
  groundWindActiveOnScreen,
  groundWindFarNearBandBalance,
  groundWindTargetParticleCount,
} from "./groundWindScreen";
import { groundWindWantsCasing } from "./groundWindSurface";

export const GROUND_WIND_TRAIL_POINTS = 28;
export const GROUND_WIND_POINTS_PER_PARTICLE = GROUND_WIND_TRAIL_POINTS + 1;
export const GROUND_WIND_POINT_STRIDE = 8;
export const GROUND_WIND_TRAIL_SAMPLE_S = 1 / 40;
export const GROUND_WIND_PARTICLES_MIN = 520;
export const GROUND_WIND_PARTICLES_MAX = 3200;
export const GROUND_WIND_AREA_PER_PARTICLE_M2 = 380;
export const GROUND_WIND_LIFE_MIN_S = 1.5;
export const GROUND_WIND_LIFE_MAX_S = 2.5;
export const GROUND_WIND_FADE_IN_S = 0.1;
export const GROUND_WIND_FADE_OUT_S = 0.32;
export const GROUND_WIND_WOBBLE = 0.11;
export const GROUND_WIND_TRAIL_LEN_MIN = 8;
export const GROUND_WIND_TRAIL_LEN_MAX = GROUND_WIND_TRAIL_POINTS - 1;
export const GROUND_WIND_CASING_WIDTH_PX = 3.5;
export const GROUND_WIND_CORE_WIDTH_SLOW_PX = 1.5;
export const GROUND_WIND_CORE_WIDTH_MID_PX = 2;
export const GROUND_WIND_CORE_WIDTH_FAST_PX = 2.5;
export const GROUND_WIND_TRAIL_HEAD_ALPHA = 1;
export const GROUND_WIND_TRAIL_MIN_LEN_PX = 40;
export const GROUND_WIND_TRAIL_MAX_LEN_PX = 80;
export const GROUND_WIND_TRAIL_FAST_MIN_LEN_PX = 60;
export const GROUND_WIND_TRAIL_FAST_MAX_LEN_PX = 110;
export const GROUND_WIND_SCREEN_MIN_SPACING_PX = GROUND_WIND_STREAMLINE_CELL_PX;
export const GROUND_WIND_STREAMLINE_STOP_PX = 7;
export const GROUND_WIND_TRAIL_LEN_JITTER = 0.35;
export const GROUND_WIND_CURL_NOISE_SCALE_PX = 120;
export const GROUND_WIND_CURL_NOISE_DEG = 4;
export const GROUND_WIND_FAST_SPEED_RATIO = 1.3;

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
};

export type GroundWindScreenSlot = {
  ci: number;
  cj: number;
  sx: number;
  sy: number;
  east: number;
  north: number;
  far: boolean;
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
  return GROUND_WIND_CORE_WIDTH_SLOW_PX;
}

export function groundWindMaxTrailWidthPx(): number {
  return GROUND_WIND_CORE_WIDTH_SLOW_PX;
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

type ScreenHeadGrid = Map<number, number[]>;

function screenHeadGridKey(cx: number, cy: number): number {
  return cy * 4099 + cx;
}

function buildScreenHeadGrid(particles: GroundWindParticles, cellPx: number): ScreenHeadGrid {
  const grid: ScreenHeadGrid = new Map();
  for (let j = 0; j < particles.count; j++) {
    const cx = Math.floor(particles.screenX[j]! / cellPx);
    const cy = Math.floor(particles.screenY[j]! / cellPx);
    const key = screenHeadGridKey(cx, cy);
    const bucket = grid.get(key);
    if (bucket) bucket.push(j);
    else grid.set(key, [j]);
  }
  return grid;
}

function minGapToOtherStreamlines(
  particles: GroundWindParticles,
  index: number,
  sx: number,
  sy: number,
  grid: ScreenHeadGrid,
  cellPx: number,
): number {
  const cx = Math.floor(sx / cellPx);
  const cy = Math.floor(sy / cellPx);
  const reach = Math.ceil(GROUND_WIND_STREAMLINE_STOP_PX / cellPx) + 1;
  let min = Number.POSITIVE_INFINITY;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const bucket = grid.get(screenHeadGridKey(cx + dx, cy + dy));
      if (!bucket) continue;
      for (let b = 0; b < bucket.length; b++) {
        const j = bucket[b]!;
        if (j === index) continue;
        const d = Math.hypot(particles.screenX[j]! - sx, particles.screenY[j]! - sy);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

export function groundWindTrailAlpha(along: number): number {
  const t = Math.min(1, Math.max(0, along));
  return GROUND_WIND_TRAIL_HEAD_ALPHA * Math.pow(t, 1.5);
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
  for (let attempt = 0; attempt < 56; attempt++) {
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
  for (let attempt = 0; attempt < 72; attempt++) {
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
      slots.push({ ci, cj, sx: screen.x, sy: screen.y, east, north, far });
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

function augmentFarGroundSlots(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  model: CityModel,
  slots: GroundWindScreenSlot[],
  viewW: number,
): GroundWindScreenSlot[] {
  const balance = groundWindFarNearBandBalance(
    Float32Array.from(slots.map((s) => s.sx)),
    Float32Array.from(slots.map((s) => s.sy)),
    slots.length,
    viewW,
  );
  if (balance.ratio >= 0.6) return slots;
  const cell = GROUND_WIND_STREAMLINE_CELL_PX;
  const extra: GroundWindScreenSlot[] = [];
  const row0 = Math.max(0, Math.floor(GROUND_WIND_FAR_Y_MIN / cell));
  const row1 = Math.min(Math.ceil(particles.viewHeight / cell) - 1, Math.floor(GROUND_WIND_FAR_Y_MAX / cell));
  const unproject = particles.screenUnproject!;
  const project = particles.screenProject!;
  const cols = Math.ceil(particles.viewWidth / cell);
  const offsets = [cell * 0.28, -cell * 0.28];
  for (let cj = row0; cj <= row1; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      for (let o = 0; o < offsets.length; o++) {
        const sx = (ci + 0.5) * cell + offsets[o]!;
        if (sx < 4 || sx > GROUND_WIND_FAR_X_MAX) continue;
        const sy = (cj + 0.5) * cell + offsets[o]! * 0.35;
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
        const far =
          screen.x < GROUND_WIND_FAR_X_MAX && screen.y >= GROUND_WIND_FAR_Y_MIN && screen.y <= GROUND_WIND_FAR_Y_MAX;
        if (!far) continue;
        extra.push({ ci, cj, sx: screen.x, sy: screen.y, east, north, far: true });
      }
    }
  }
  const nearRow0 = Math.floor(GROUND_WIND_NEAR_Y_MIN / cell);
  const nearRow1 = Math.floor(GROUND_WIND_NEAR_Y_MAX / cell);
  const trimmed = slots.filter((s) => {
    const cjRow = s.cj;
    return cjRow < nearRow0 || cjRow > nearRow1;
  });
  return mergeScreenSlots([...trimmed, ...slots.filter((s) => s.sy >= GROUND_WIND_NEAR_Y_MIN && s.sy <= GROUND_WIND_NEAR_Y_MAX), ...extra]);
}

function capSlotsForFarNearBalance(slots: GroundWindScreenSlot[], viewW: number): GroundWindScreenSlot[] {
  const farArea = Math.max(1, GROUND_WIND_FAR_X_MAX * (GROUND_WIND_FAR_Y_MAX - GROUND_WIND_FAR_Y_MIN));
  const nearArea = Math.max(1, viewW * (GROUND_WIND_NEAR_Y_MAX - GROUND_WIND_NEAR_Y_MIN));
  const far = slots.filter((s) => s.far);
  const near = slots.filter((s) => s.sy >= GROUND_WIND_NEAR_Y_MIN && s.sy <= GROUND_WIND_NEAR_Y_MAX);
  const other = slots.filter((s) => !s.far && (s.sy < GROUND_WIND_NEAR_Y_MIN || s.sy > GROUND_WIND_NEAR_Y_MAX));
  const maxNear = Math.ceil((far.length * nearArea) / (0.6 * farArea));
  const nearPick = near.length > maxNear ? near.slice(0, maxNear) : near;
  return mergeScreenSlots([...far, ...nearPick, ...other]);
}

function prioritizeGroundSlots(slots: GroundWindScreenSlot[], seed: number, cap: number): GroundWindScreenSlot[] {
  if (slots.length <= cap) return slots;
  const rng = seededRandom(seed);
  const ranked = slots.map((slot) => ({
    slot,
    key: rng() * (slot.far ? 0.38 : 1),
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
  const { rng } = particles;
  const east = slot.east;
  const north = slot.north;
  particles.east[i] = east;
  particles.north[i] = north;
  particles.age[i] = 0;
  particles.life[i] = GROUND_WIND_LIFE_MIN_S + rng() * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
  particles.seed[i] = rng() * Math.PI * 2;
  particles.speed[i] = groundWindSpeedAt(field, east, north);
  particles.head[i] = 0;
  particles.gridCol[i] = slot.ci;
  particles.gridRow[i] = slot.cj;
  particles.slotSx[i] = slot.sx;
  particles.slotSy[i] = slot.sy;
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
  const augmented = augmentFarGroundSlots(particles, field, heightAt, model, gathered, w);
  const balanced = capSlotsForFarNearBalance(augmented, w);
  const cap = particles.east.length;
  const slots = prioritizeGroundSlots(balanced, seed, cap);
  particles.count = Math.max(GROUND_WIND_PARTICLES_MIN, slots.length);
  for (let i = 0; i < particles.count; i++) {
    const slot = slots[i]!;
    particles.trailLenScale[i] = 1 - GROUND_WIND_TRAIL_LEN_JITTER + particles.rng() * GROUND_WIND_TRAIL_LEN_JITTER * 2;
    spawnParticleAtSlot(particles, field, heightAt, i, slot);
    particles.age[i] = ((i + particles.rng()) / Math.max(1, particles.count)) * GROUND_WIND_LIFE_MAX_S * 0.97;
  }
  return particles.count;
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
  };
  for (let i = 0; i < count; i++) {
    particles.trailLenScale[i] = 1;
    particles.life[i] = GROUND_WIND_LIFE_MIN_S + particles.rng() * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
    particles.age[i] = ((i + particles.rng()) / Math.max(1, count)) * GROUND_WIND_LIFE_MAX_S * 0.4;
  }
  if (!particles.screenUnproject) {
    for (let i = 0; i < count; i++) {
      spawnParticle(particles, field, heightAt, i);
      particles.age[i] = ((i + particles.rng()) / Math.max(1, count)) * particles.life[i]! * 0.98;
    }
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
  particles.age[i] = 0;
  particles.life[i] = GROUND_WIND_LIFE_MIN_S + rng() * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
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
): number {
  const ramp = speedRamp(speed);
  let visible = Math.round(GROUND_WIND_TRAIL_LEN_MIN + ramp * (GROUND_WIND_TRAIL_LEN_MAX - GROUND_WIND_TRAIL_LEN_MIN));
  const fastStream = fast && speed > streamMag * GROUND_WIND_FAST_SPEED_RATIO;
  let targetPx = fastStream
    ? 0.5 * (GROUND_WIND_TRAIL_FAST_MIN_LEN_PX + GROUND_WIND_TRAIL_FAST_MAX_LEN_PX)
    : 0.5 * (GROUND_WIND_TRAIL_MIN_LEN_PX + GROUND_WIND_TRAIL_MAX_LEN_PX);
  targetPx *= Math.max(0.5, Math.min(1.5, lenScale));
  const stepM = Math.max(0.12, metresPerSecond * GROUND_WIND_TRAIL_SAMPLE_S * 1.27);
  const need = Math.ceil((targetPx * Math.max(0.002, metresPerPx)) / stepM);
  visible = Math.max(visible, need);
  return Math.min(GROUND_WIND_TRAIL_LEN_MAX, visible);
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
  const fadeIn = 1 - Math.exp(-age / GROUND_WIND_FADE_IN_S);
  const remain = Math.max(0, life - age);
  const fadeOut = 1 - Math.exp(-remain / GROUND_WIND_FADE_OUT_S);
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

export function stepGroundWindParticles(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  dt: number,
  metresPerSecond: number,
) {
  particles.sampleClock += dt;
  let pushes = 0;
  while (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S && pushes < 4) {
    particles.sampleClock -= GROUND_WIND_TRAIL_SAMPLE_S;
    pushes++;
  }
  if (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S) particles.sampleClock = 0;

  const baseMag = Math.hypot(field.base.east, field.base.north) || 1;
  for (let i = 0; i < particles.count; i++) {
    const e0 = particles.east[i]!;
    const n0 = particles.north[i]!;
    const v1 = groundWindVelocityAt(field, e0, n0, scratch);
    const halfStep = metresPerSecond * dt * 0.5;
    const midE = e0 + v1.east * halfStep;
    const midN = n0 + v1.north * halfStep;
    const v2 = groundWindVelocityAt(field, midE, midN, scratch);
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
    const yCheck = heightAt(east, north);
    const model = particles.cityModel;
    const offScreen = !groundWindActiveOnScreen(particles, east, north, yCheck);
    const cell = groundWindCellIndex(field, east, north);
    const inFoot = model != null && groundWindInsideFootprint(model, east, north);
    if (cell < 0 || field.solid[cell] === 1 || inFoot || offScreen || age >= particles.life[i]!) {
      spawnParticle(particles, field, heightAt, i);
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
  writePoints(particles, heightAt, field, metresPerSecond);
}

function writePoints(particles: GroundWindParticles, heightAt: HeightAt, field: GroundWindField, metresPerSecond: number) {
  const { points, history } = particles;
  const streamMag = Math.hypot(field.base.east, field.base.north) || 1;
  const project = particles.screenProject;
  const model = particles.cityModel;
  const headGrid =
    project != null ? buildScreenHeadGrid(particles, GROUND_WIND_STREAMLINE_CELL_PX) : null;
  for (let i = 0; i < particles.count; i++) {
    const speed = particles.speed[i]!;
    const env = lifeEnvelope(particles.age[i]!, particles.life[i]!);
    const fast = speed > streamMag * GROUND_WIND_FAST_SPEED_RATIO;
    const localKmh = groundWindLocalSpeedKmh(speed, streamMag, particles.medianKmh);
    const band = groundWindSpeedBand(localKmh);
    const corePx = groundWindCoreWidthPx(localKmh);
    const lenScale = particles.trailLenScale[i] ?? 1;
    let visible = trailVisibleSegments(speed, streamMag, fast, particles.metresPerPx, metresPerSecond, lenScale);
    const head = particles.head[i]!;
    const east = particles.east[i]!;
    const north = particles.north[i]!;
    const yHead = heightAt(east, north);
    if (project && headGrid && visible > 2) {
      for (let k = 2; k < visible; k++) {
        const slot = (head + GROUND_WIND_TRAIL_POINTS - visible + k + 1) % GROUND_WIND_TRAIL_POINTS;
        const h = (i * GROUND_WIND_TRAIL_POINTS + slot) * 3;
        const he = history[h]!;
        const hn = history[h + 1]!;
        const hy = history[h + 2]!;
        const screen = project(he, hn, hy);
        if (!screen) continue;
        if (
          minGapToOtherStreamlines(
            particles,
            i,
            screen.x,
            screen.y,
            headGrid,
            GROUND_WIND_STREAMLINE_CELL_PX,
          ) < GROUND_WIND_STREAMLINE_STOP_PX
        ) {
          visible = Math.max(2, k);
          break;
        }
      }
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
        points[out + 5] = 0;
        points[out + 6] = corePx;
        points[out + 7] = 0;
        continue;
      }
      const slot = (head + GROUND_WIND_TRAIL_POINTS - visible + k + 1) % GROUND_WIND_TRAIL_POINTS;
      const h = (i * GROUND_WIND_TRAIL_POINTS + slot) * 3;
      const segE = history[h]!;
      const segN = history[h + 1]!;
      const segY = history[h + 2]!;
      points[out] = segE;
      points[out + 1] = segY;
      points[out + 2] = -segN;
      const along = alongProfile(k, maxAlong);
      points[out + 3] = env * groundWindTrailAlpha(along);
      points[out + 4] = along;
      points[out + 5] = band;
      points[out + 6] = corePx;
      const casing = model != null && groundWindWantsCasing(model, segE, segN) ? 1 : 0;
      points[out + 7] = casing;
    }
    const live = particleBase + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE;
    points[live] = east;
    points[live + 1] = yHead;
    points[live + 2] = -north;
    points[live + 3] = env * GROUND_WIND_TRAIL_HEAD_ALPHA;
    points[live + 4] = 1;
    points[live + 5] = band;
    points[live + 6] = corePx;
    points[live + 7] = model != null && groundWindWantsCasing(model, east, north) ? 1 : 0;
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
