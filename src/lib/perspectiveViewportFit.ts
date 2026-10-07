import { CAMERA_FIT_INCLUDES_HELIODON } from "./sceneCameraFit";
import type { SolarViewSettings } from "../components/SolarHeliodon";
import {
  DEFAULT_PERSPECTIVE_OFFSET,
  defaultPerspectiveDistance,
  defaultPerspectiveTarget,
  heliodonSceneBounds,
  perspectiveFitDistance,
} from "./heliodonFraming";
import { frameCentre, type Vec3 } from "./isoCamera";

export type PerspectiveViewportPose = {
  eye: Vec3;
  target: Vec3;
  near: number;
  far: number;
};

export function computePerspectiveViewportPose(input: {
  side: number;
  lift: number;
  groundY: number;
  siteTopY: number;
  heliodonRadius: number;
  solar: SolarViewSettings;
  lat: number;
  lon: number;
  fov: number;
  aspect: number;
}): PerspectiveViewportPose {
  const { side, lift, groundY, siteTopY, heliodonRadius, solar, lat, lon, fov, aspect } = input;
  let target: Vec3;
  let distance: number;
  if (CAMERA_FIT_INCLUDES_HELIODON && solar.showPath) {
    const bounds = heliodonSceneBounds({
      lat,
      lon,
      year: solar.year,
      month: solar.month,
      day: solar.day,
      hour: solar.hour,
      minute: solar.minute,
      sideM: side,
      ringRadiusM: heliodonRadius,
      groundY,
      siteTopY,
    });
    target = frameCentre(bounds);
    distance =
      perspectiveFitDistance(bounds, target, DEFAULT_PERSPECTIVE_OFFSET, fov, aspect) *
      (1 + Math.max(0, solar.radiusFactor - 1) * 0.08);
  } else {
    target = defaultPerspectiveTarget(side, lift);
    distance = defaultPerspectiveDistance(side);
  }
  const eye: Vec3 = [
    target[0] + DEFAULT_PERSPECTIVE_OFFSET[0] * distance,
    target[1] + DEFAULT_PERSPECTIVE_OFFSET[1] * distance,
    target[2] + DEFAULT_PERSPECTIVE_OFFSET[2] * distance,
  ];
  return {
    eye,
    target,
    near: Math.max(0.1, side / 400),
    far: Math.max(side * 40, heliodonRadius * 28, distance * 2.5),
  };
}

export function perspectiveClipFar(side: number, heliodonRadius: number, eyeToTargetDistance: number): number {
  return Math.max(side * 40, heliodonRadius * 28, eyeToTargetDistance * 2.5);
}
