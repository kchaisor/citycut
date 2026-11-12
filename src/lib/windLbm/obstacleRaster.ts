import type { BuildingFeat } from "../../types";
import { openRing, signedArea } from "../geo";
import type { Pt } from "../../types";
import type { WindLbmGridSpec } from "./types";

function pointInRing(east: number, north: number, ring: Pt[]): boolean {
  let inside = false;
  const pts = openRing(ring);
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]![0];
    const yi = pts[i]![1];
    const xj = pts[j]![0];
    const yj = pts[j]![1];
    if (yi > north !== yj > north && east < ((xj - xi) * (north - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cellInsideBuilding(east: number, north: number, building: BuildingFeat): boolean {
  if (!pointInRing(east, north, building.ring)) return false;
  for (const hole of building.holes) {
    if (pointInRing(east, north, hole)) return false;
  }
  if (building.extrusionParts) {
    for (const part of building.extrusionParts) {
      if (pointInRing(east, north, part.ring)) {
        for (const hole of part.holes) {
          if (pointInRing(east, north, hole)) return false;
        }
        return true;
      }
    }
  }
  return true;
}

export function windLbmCellSize(spec: WindLbmGridSpec): number {
  return spec.sideM / Math.max(spec.nx, spec.ny);
}

export const WIND_LBM_DOMAIN_MARGIN = 0.175;

export function windLbmGridSpec(sideM: number, longSide: number, margin = WIND_LBM_DOMAIN_MARGIN): WindLbmGridSpec {
  const nx = longSide;
  const ny = Math.max(32, Math.round(longSide));
  const domainSideM = sideM * (1 + 2 * margin);
  return { nx, ny, sideM: domainSideM, cutSideM: sideM };
}

export function cutFluidMask(spec: WindLbmGridSpec): Uint8Array {
  const mask = new Uint8Array(spec.nx * spec.ny);
  const cutHalf = spec.cutSideM / 2;
  const domainHalf = spec.sideM / 2;
  const dx = spec.sideM / spec.nx;
  const dy = spec.sideM / spec.ny;
  for (let j = 0; j < spec.ny; j++) {
    const north = -domainHalf + (j + 0.5) * dy;
    for (let i = 0; i < spec.nx; i++) {
      const east = -domainHalf + (i + 0.5) * dx;
      if (Math.abs(east) > cutHalf || Math.abs(north) > cutHalf) mask[i + j * spec.nx] = 1;
    }
  }
  return mask;
}

export function rasterizeBuildingObstacles(
  buildings: readonly BuildingFeat[],
  spec: WindLbmGridSpec,
  out?: Uint8Array,
): Uint8Array {
  const mask = out && out.length === spec.nx * spec.ny ? out : new Uint8Array(spec.nx * spec.ny);
  mask.fill(0);
  const domainHalf = spec.sideM / 2;
  const dx = spec.sideM / spec.nx;
  const dy = spec.sideM / spec.ny;
  for (let j = 0; j < spec.ny; j++) {
    const north = -domainHalf + (j + 0.5) * dy;
    for (let i = 0; i < spec.nx; i++) {
      const east = -domainHalf + (i + 0.5) * dx;
      for (const building of buildings) {
        if (cellInsideBuilding(east, north, building)) {
          mask[i + j * spec.nx] = 1;
          break;
        }
      }
    }
  }
  return mask;
}

export function obstacleMaskFingerprint(buildings: readonly BuildingFeat[], spec: WindLbmGridSpec): string {
  let area = 0;
  for (const b of buildings) {
    area += Math.abs(signedArea(b.ring));
  }
  return `${spec.nx}x${spec.ny}:${spec.sideM.toFixed(2)}:${spec.cutSideM.toFixed(2)}:${buildings.length}:${area.toFixed(1)}`;
}
