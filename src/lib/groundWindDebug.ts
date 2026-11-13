import {
  GROUND_WIND_FAR_X_MAX,
  GROUND_WIND_FAR_Y_MAX,
  GROUND_WIND_FAR_Y_MIN,
  GROUND_WIND_NEAR_Y_MAX,
  GROUND_WIND_NEAR_Y_MIN,
} from "./groundWindScreen";
import {
  GROUND_WIND_POINT_STRIDE,
  GROUND_WIND_POINTS_PER_PARTICLE,
  GROUND_WIND_TRAIL_POINTS,
  groundWindFrameCoverageProxy,
  lifeEnvelope,
  type GroundWindParticles,
} from "./groundWindParticles";

export type GroundWindDebugSnapshot = {
  active: number;
  max: number;
  layoutActive: number;
  drawable: number;
  farCount: number;
  nearCount: number;
  coverageRatio: number;
};

declare global {
  interface Window {
    __citycutGroundWind?: GroundWindDebugSnapshot;
  }
}

export function groundWindDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "wind";
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
  };
}
