import type { LonLat } from "../types";

export function walkRippleAmenityCutKey(center: LonLat, sideM: number): string {
  return `${center.lat.toFixed(5)},${center.lon.toFixed(5)},${sideM}`;
}
