import * as THREE from "three";
import { getColour } from "./colours";

const TEX_W = 96;
const TEX_H = 24;

export function bakeGroundWindGlyphTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array(TEX_W * TEX_H * 4).fill(255);
    const texture = new THREE.DataTexture(data, TEX_W, TEX_H);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  const midY = TEX_H / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ink = getColour("--view-ink");
  const paper = getColour("--primary-surface");
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(8, midY);
  ctx.lineTo(TEX_W - 14, midY);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(TEX_W - 10, midY);
  ctx.lineTo(TEX_W - 22, midY - 7);
  ctx.lineTo(TEX_W - 22, midY + 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = paper;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(10, midY);
  ctx.lineTo(TEX_W - 18, midY);
  ctx.stroke();
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.moveTo(TEX_W - 14, midY);
  ctx.lineTo(TEX_W - 24, midY - 4.5);
  ctx.lineTo(TEX_W - 24, midY + 4.5);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
