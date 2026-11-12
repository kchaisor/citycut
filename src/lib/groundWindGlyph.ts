import * as THREE from "three";
import { getColour } from "./colours";

const TEX_W = 128;
const TEX_H = 48;

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
  const ink = getColour("--view-ink");
  const paper = getColour("--primary-surface");
  const flow = getColour("--ground-wind-flow");
  const grad = ctx.createLinearGradient(0, midY, TEX_W, midY);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.12, flow);
  grad.addColorStop(0.55, paper);
  grad.addColorStop(0.88, flow);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(TEX_W * 0.5, midY, TEX_W * 0.46, TEX_H * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(TEX_W * 0.52, midY, TEX_W * 0.38, TEX_H * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(TEX_W - 18, midY);
  ctx.lineTo(TEX_W - 32, midY - 8);
  ctx.lineTo(TEX_W - 32, midY + 8);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function bakeGroundWindHaloTexture(): THREE.Texture {
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
  const paper = getColour("--primary-surface");
  const grad = ctx.createRadialGradient(TEX_W * 0.45, midY, 2, TEX_W * 0.45, midY, TEX_H * 0.48);
  grad.addColorStop(0, paper);
  grad.addColorStop(0.45, paper);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(TEX_W * 0.45, midY, TEX_W * 0.5, TEX_H * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
