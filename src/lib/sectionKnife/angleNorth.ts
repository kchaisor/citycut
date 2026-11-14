import type { SectionKnifePose } from "./plane";

const DEG = Math.PI / 180;

export function northClockwiseDegFromPose(pose: SectionKnifePose): number {
  const tangentEast = -Math.sin(pose.angleRad);
  const tangentNorth = -Math.cos(pose.angleRad);
  let deg = (Math.atan2(tangentEast, tangentNorth) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Math.round(deg * 100) / 100;
}

export function poseFromNorthClockwiseDeg(angleDeg: number, offsetM: number): SectionKnifePose {
  const norm = ((angleDeg % 360) + 360) % 360;
  const radians = norm * DEG;
  return { angleRad: Math.atan2(-Math.sin(radians), -Math.cos(radians)), offsetM };
}

export function presetNorthClockwiseDeg(preset: 0 | 45 | 90): number {
  return preset;
}
