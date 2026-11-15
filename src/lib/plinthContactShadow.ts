import * as THREE from "three";
import {
  PLINTH_SHADOW_SPREAD,
  type SiteFrame,
  plinthShadowExtents,
  siteFrameShadowCacheKey,
} from "./siteFrame";

export const PLINTH_SHADOW_TEXTURE_PX = 512;

export function plinthShadowCoreExtentsM(
  frame: SiteFrame,
  spread = PLINTH_SHADOW_SPREAD,
): { widthM: number; heightM: number } {
  const plane = plinthShadowExtents(frame, spread);
  const fraction = 1 / spread;
  return { widthM: plane.widthM * fraction, heightM: plane.heightM * fraction };
}

export function bakePlinthShadowTexture(colour: string, frame: SiteFrame): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = PLINTH_SHADOW_TEXTURE_PX;
  canvas.height = PLINTH_SHADOW_TEXTURE_PX;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const size = PLINTH_SHADOW_TEXTURE_PX / PLINTH_SHADOW_SPREAD;
  const centre = PLINTH_SHADOW_TEXTURE_PX / 2;
  const away = PLINTH_SHADOW_TEXTURE_PX * 4;
  const footprint = (inset: number) => {
    context.beginPath();
    if (frame.shape === "circle") {
      context.arc(centre - away, centre, size / 2 - inset, 0, Math.PI * 2);
    } else {
      const edge = size - inset * 2;
      context.rect(centre - away - size / 2 + inset, centre - size / 2 + inset, edge, edge);
    }
    context.fill();
  };
  context.fillStyle = colour;
  context.shadowColor = colour;
  context.shadowOffsetX = away;
  context.globalAlpha = 0.55;
  context.shadowBlur = size * 0.11;
  footprint(-size * 0.015);
  context.globalAlpha = 0.9;
  context.shadowBlur = size * 0.025;
  footprint(0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const shadowTextureCache = new Map<string, THREE.CanvasTexture>();

export function plinthShadowTextureCacheKey(frame: SiteFrame, colour: string): string {
  return `${siteFrameShadowCacheKey(frame)}:${colour}`;
}

export type PlinthShadowTextureBaker = (colour: string, frame: SiteFrame) => THREE.CanvasTexture | null;

export function getPlinthShadowTexture(
  frame: SiteFrame,
  colour: string,
  baker: PlinthShadowTextureBaker = bakePlinthShadowTexture,
): THREE.CanvasTexture | null {
  const key = plinthShadowTextureCacheKey(frame, colour);
  const hit = shadowTextureCache.get(key);
  if (hit) return hit;
  const created = baker(colour, frame);
  if (created) shadowTextureCache.set(key, created);
  return created;
}

export function clearPlinthShadowTextureCache(): void {
  for (const texture of shadowTextureCache.values()) texture.dispose();
  shadowTextureCache.clear();
}

export function plinthShadowTextureCacheSize(): number {
  return shadowTextureCache.size;
}