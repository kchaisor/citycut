import type { CityModel } from "../types";
import { DEFAULT_SITE_FRAME_SHAPE, frameGroundSize, type FrameGroundSize, type SiteFrameShape } from "./siteFrame";

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

export function cutFrameSize(widthM: number, heightM: number, sideM: number): FrameGroundSize {
  return frameGroundSize(sideM, widthM, heightM);
}

export function usesRectFrame(shape: SiteFrameShape, size: FrameGroundSize, sideM: number): boolean {
  if (shape === "a3") return true;
  return Math.abs(size.widthM - sideM) > 0.01 || Math.abs(size.heightM - sideM) > 0.01;
}

export function modelSiteFrame(
  model: Pick<CityModel, "sideM" | "widthM" | "heightM" | "frameShape">,
): { sideM: number; shape: SiteFrameShape; size: FrameGroundSize } {
  const size = modelFrameSize(model);
  return { sideM: model.sideM, shape: model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE, size };
}
