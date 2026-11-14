import type { CityModel } from "../../types";
import type { SectionKnifePose } from "./plane";
import { collectElevationProfiles, groundProfileSamples, sectionAxis, type SectionProfile } from "./profiles";

export type SectionElevationModel = {
  halfWidthM: number;
  minYM: number;
  maxYM: number;
  profiles: SectionProfile[];
  ground: { tangent: number; y: number }[];
};

export function buildSectionElevation(model: CityModel, pose: SectionKnifePose): SectionElevationModel {
  const axis = sectionAxis(model, pose);
  const profiles = collectElevationProfiles(model, pose);
  const ground = groundProfileSamples(model, pose, 72);
  let minYM = Infinity;
  let maxYM = -Infinity;
  for (const sample of ground) {
    minYM = Math.min(minYM, sample.y);
    maxYM = Math.max(maxYM, sample.y);
  }
  for (const profile of profiles) {
    minYM = Math.min(minYM, profile.baseY);
    maxYM = Math.max(maxYM, profile.topY);
  }
  if (!Number.isFinite(minYM) || !Number.isFinite(maxYM)) {
    const groundY = model.terrain ? model.terrain.min : 0;
    minYM = groundY;
    maxYM = groundY + 20;
  }
  const padBelow = Math.max(2, (maxYM - minYM) * 0.04);
  const padAbove = Math.max(3, (maxYM - minYM) * 0.06);
  return {
    halfWidthM: axis.halfWidth,
    minYM: minYM - padBelow,
    maxYM: maxYM + padAbove,
    profiles,
    ground,
  };
}

export function sectionElevationRlTicks(
  minYM: number,
  maxYM: number,
  yScale: (y: number) => number,
  maxCount = 4,
  minGapPx = 28,
): number[] {
  const span = Math.max(1, maxYM - minYM);
  const stepCandidates = span > 50 ? [20, 25, 10, 15] : span > 25 ? [10, 15, 5, 20] : [5, 10, 2];
  for (const step of stepCandidates) {
    const start = Math.ceil(minYM / step) * step;
    const candidates: number[] = [];
    for (let y = start; y <= maxYM + 0.01; y += step) candidates.push(Math.round(y));
    const ticks: number[] = [];
    for (const y of candidates) {
      if (ticks.length === 0) {
        ticks.push(y);
        continue;
      }
      if (Math.abs(yScale(y) - yScale(ticks[ticks.length - 1]!)) >= minGapPx) ticks.push(y);
      if (ticks.length >= maxCount) break;
    }
    if (ticks.length >= 2 && ticks.length <= maxCount) return ticks;
  }
  const mid = Math.round((minYM + maxYM) / 2);
  const lo = Math.round(minYM);
  const hi = Math.round(maxYM);
  if (Math.abs(yScale(mid) - yScale(lo)) >= minGapPx && Math.abs(yScale(hi) - yScale(mid)) >= minGapPx) return [lo, mid, hi];
  return [lo, hi];
}
