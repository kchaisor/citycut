import type { CityModel } from "../types";
import type { FrameGroundSize } from "./siteFrame";

export function modelFrameSize(model: Pick<CityModel, "sideM" | "widthM" | "heightM">): FrameGroundSize {
  return {
    widthM: model.widthM ?? model.sideM,
    heightM: model.heightM ?? model.sideM,
  };
}

export function modelClipSideM(model: Pick<CityModel, "sideM" | "widthM" | "heightM">): number {
  const size = modelFrameSize(model);
  return Math.max(size.widthM, size.heightM);
}
