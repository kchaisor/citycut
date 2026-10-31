import type { CityModel } from "../../types";
import type { SectionKnifePose } from "./plane";
import { collectSectionProfiles, groundProfileSamples, sectionAxis, type SectionProfile } from "./profiles";

export type SectionElevationModel = {
  halfWidthM: number;
  minYM: number;
  maxYM: number;
  profiles: SectionProfile[];
  ground: { tangent: number; y: number }[];
};

export function buildSectionElevation(model: CityModel, pose: SectionKnifePose): SectionElevationModel {
  const axis = sectionAxis(model, pose);
  const profiles = collectSectionProfiles(model, pose);
  const ground = groundProfileSamples(model, pose, 56);
  const groundY = model.terrain ? model.terrain.min : 0;
  let minYM = groundY;
  let maxYM = groundY + 25;
  for (const sample of ground) {
    minYM = Math.min(minYM, sample.y);
    maxYM = Math.max(maxYM, sample.y + 5);
  }
  for (const profile of profiles) {
    minYM = Math.min(minYM, profile.baseY);
    maxYM = Math.max(maxYM, profile.topY);
  }
  return {
    halfWidthM: axis.halfWidth,
    minYM,
    maxYM: maxYM + 3,
    profiles,
    ground,
  };
}
