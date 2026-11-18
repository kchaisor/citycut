import type { Vec3 } from "./solar";

export function planToWorld(east: number, north: number, yM: number): Vec3 {
  return [east, yM, -north];
}

export function worldOutward3(outwardEast: number, outwardNorth: number): Vec3 {
  const len = Math.hypot(outwardEast, outwardNorth) || 1;
  return [outwardEast / len, 0, -outwardNorth / len];
}
