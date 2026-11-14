import * as THREE from "three";
import {
  DEFAULT_SITE_FRAME_SHAPE,
  frameGroundSize,
  pointInSiteFrame,
  type FrameGroundSize,
  type SiteFrameShape,
} from "./siteFrame";
import type { Pt } from "../types";

export function vertexInsideSiteFrame(
  east: number,
  north: number,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): boolean {
  return pointInSiteFrame([east, north], sideM, shape, size);
}

export function clipBufferGeometryToSiteFrame(
  geometry: THREE.BufferGeometry,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  frameWidthM?: number,
  frameHeightM?: number,
): THREE.BufferGeometry | null {
  const size = frameGroundSize(sideM, frameWidthM, frameHeightM);
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) return null;
  const out: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const ax = position.getX(i)!;
    const ay = position.getY(i)!;
    const az = position.getZ(i)!;
    const bx = position.getX(i + 1)!;
    const by = position.getY(i + 1)!;
    const bz = position.getZ(i + 2)!;
    const cx = position.getX(i + 2)!;
    const cy = position.getY(i + 2)!;
    const cz = position.getZ(i + 2)!;
    const inside = (x: number, z: number) => vertexInsideSiteFrame(x, -z, sideM, shape, size);
    if (!inside(ax, az) || !inside(bx, bz) || !inside(cx, cz)) continue;
    out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  }
  if (out.length < 9) return null;
  const clipped = new THREE.BufferGeometry();
  clipped.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  clipped.computeVertexNormals();
  return clipped;
}

export function bufferGeometryVerticesInsideSiteFrame(
  geometry: THREE.BufferGeometry,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): boolean {
  const frameSize = size ?? frameGroundSize(sideM);
  const position = geometry.getAttribute("position");
  if (!position) return true;
  for (let i = 0; i < position.count; i++) {
    const east = position.getX(i)!;
    const north = -position.getZ(i)!;
    if (!pointInSiteFrame([east, north], sideM, shape, frameSize)) return false;
  }
  return true;
}

export function clipPolylinesMinLength(lines: Pt[][], minM: number): Pt[][] {
  const out: Pt[][] = [];
  for (const line of lines) {
    let total = 0;
    for (let i = 0; i < line.length - 1; i++) {
      total += Math.hypot(line[i + 1]![0] - line[i]![0], line[i + 1]![1] - line[i]![1]);
    }
    if (total >= minM) out.push(line);
  }
  return out;
}