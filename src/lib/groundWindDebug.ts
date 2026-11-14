import {
  GROUND_WIND_FAR_X_MAX,
  GROUND_WIND_FAR_Y_MAX,
  GROUND_WIND_FAR_Y_MIN,
  GROUND_WIND_NEAR_Y_MAX,
  GROUND_WIND_NEAR_Y_MIN,
} from "./groundWindScreen";
import type { GroundWindField } from "./groundWindField";
import type { CityModel } from "../types";
import {
  GROUND_WIND_POINT_STRIDE,
  GROUND_WIND_POINTS_PER_PARTICLE,
  GROUND_WIND_TRAIL_POINTS,
  type GroundWindDrawnWindowRect,
  groundWindDrawnSeQuarterBands,
  groundWindFrameCoverageProxy,
  groundWindFrameWindowDensityAudit,
  lifeEnvelope,
  type GroundWindParticles,
  type GroundWindWindowDensitySample,
  type HeightAt,
} from "./groundWindParticles";

export type GroundWindDebugWindow = {
  x0: number;
  y0: number;
  size: number;
  groundFrac: number;
  drawnSegments: number;
  drawnLengthPx: number;
  groundNormalisedLength: number;
};

export type GroundWindDebugSnapshot = {
  active: number;
  max: number;
  layoutActive: number;
  drawable: number;
  farCount: number;
  nearCount: number;
  coverageRatio: number;
  windows: GroundWindDebugWindow[];
  seDrawn: {
    x600_800: GroundWindDrawnWindowRect;
    x800_1000: GroundWindDrawnWindowRect;
  } | null;
};

declare global {
  interface Window {
    __citycutGroundWind?: GroundWindDebugSnapshot;
    __citycutGroundWindAudit?: () => GroundWindDebugSnapshot;
  }
}

export function groundWindDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "wind";
}

function toDebugWindow(sample: GroundWindWindowDensitySample, size: number): GroundWindDebugWindow {
  return {
    x0: sample.x0,
    y0: sample.y0,
    size,
    groundFrac: sample.groundFrac,
    drawnSegments: sample.drawnSegments,
    drawnLengthPx: sample.drawnLengthPx,
    groundNormalisedLength: sample.normalised,
  };
}

export function groundWindRenderStats(particles: GroundWindParticles, _viewW: number): GroundWindDebugSnapshot {
  let drawable = 0;
  let farCount = 0;
  let nearCount = 0;
  const { points } = particles;
  for (let i = 0; i < particles.count; i++) {
    const env = lifeEnvelope(particles.age[i]!, particles.life[i]!);
    if (env < 0.04) continue;
    const live = i * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE;
    const alpha = points[live + 3]!;
    if (alpha < 0.04) continue;
    drawable++;
    const sx = particles.screenX[i]!;
    const sy = particles.screenY[i]!;
    if (sx < GROUND_WIND_FAR_X_MAX && sy >= GROUND_WIND_FAR_Y_MIN && sy <= GROUND_WIND_FAR_Y_MAX) farCount++;
    if (sy >= GROUND_WIND_NEAR_Y_MIN && sy <= GROUND_WIND_NEAR_Y_MAX) nearCount++;
  }
  const coverageRatio = groundWindFrameCoverageProxy(particles);
  return {
    active: particles.count,
    max: particles.maxCount,
    layoutActive: particles.layoutCount,
    drawable,
    farCount,
    nearCount,
    coverageRatio,
    windows: [],
    seDrawn: null,
  };
}

export function groundWindDebugSnapshot(
  particles: GroundWindParticles,
  field: GroundWindField,
  model: CityModel,
  heightAt: HeightAt,
): GroundWindDebugSnapshot {
  const base = groundWindRenderStats(particles, particles.viewWidth);
  const windowSize = 200;
  const audit = groundWindFrameWindowDensityAudit(particles, field, model, heightAt, windowSize, 0.15, 100, 0);
  const windows = audit.samples.map((sample) => toDebugWindow(sample, windowSize));
  const bands = groundWindDrawnSeQuarterBands(particles, field, model, heightAt);
  return {
    ...base,
    windows,
    seDrawn: {
      x600_800: bands.left,
      x800_1000: bands.right,
    },
  };
}
