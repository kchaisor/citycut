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
  maxCount = 5,
  minGapPx = 22,
): number[] {
  const span = Math.max(1, maxYM - minYM);
  const stepCandidates = span > 50 ? [20, 10, 25, 15, 5] : span > 25 ? [10, 5, 15, 20] : [5, 10, 2];
  for (const step of stepCandidates) {
    const start = Math.ceil(minYM / step) * step;
    const ticks: number[] = [];
    for (let y = start; y <= maxYM + 0.01; y += step) ticks.push(Math.round(y * 10) / 10);
    if (ticks.length < 2 || ticks.length > maxCount) continue;
    let spaced = true;
    for (let i = 1; i < ticks.length; i++) {
      if (Math.abs(yScale(ticks[i]!) - yScale(ticks[i - 1]!)) < minGapPx) spaced = false;
    }
    if (spaced) return ticks;
  }
  const mid = (minYM + maxYM) / 2;
  return [Math.round(minYM), Math.round(mid), Math.round(maxYM)];
}
