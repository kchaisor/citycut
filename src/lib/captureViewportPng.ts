import type * as THREE from "three";
import { POST_OVERLAY_LAYER } from "./postOverlay";

export type ViewportOverlayLabel = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
  color: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
};

export type ViewportRect = { x: number; y: number; width: number; height: number };

export type ViewportOverlayCanvas = ViewportRect & { canvas: HTMLCanvasElement };

export type ViewportCapture = {
  background: string | null;
  labels: readonly ViewportOverlayLabel[];
  crop?: ViewportRect | null;
  overlays?: readonly ViewportOverlayCanvas[];
};

export type ViewportPngOptions = { transparent?: boolean; scale?: number };

export const VIEWPORT_CROP_OBSTACLES = [
  ".model .hud-card",
  ".model .top-bar-left",
  ".model .top-bar-center",
  ".model .top-bar-right",
  ".model .left-rail",
  ".model .left-tool-rail",
  ".model .left-outliner",
  ".model .right-inspector",
  ".model .bottom-bar",
].join(", ");

export const HQ_DEFAULT_SCALE = 3;
export const HQ_MAX_TEXTURE_FALLBACK = 8192;

type Box = { left: number; top: number; right: number; bottom: number };

function boxArea(box: Box): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

function intersects(a: Box, b: Box): boolean {
  return b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top;
}

export function freeViewportBox(canvas: Box, obstacles: readonly Box[]): Box {
  let free: Box = { ...canvas };
  const ordered = [...obstacles].sort((a, b) => boxArea(b) - boxArea(a));
  for (const obstacle of ordered) {
    if (!intersects(free, obstacle)) continue;
    const options: Box[] = [
      { ...free, left: Math.max(free.left, obstacle.right) },
      { ...free, right: Math.min(free.right, obstacle.left) },
      { ...free, top: Math.max(free.top, obstacle.bottom) },
      { ...free, bottom: Math.min(free.bottom, obstacle.top) },
    ];
    free = options.reduce((best, option) => (boxArea(option) > boxArea(best) ? option : best));
  }
  return free;
}

function liveObstacleBoxes(): Box[] {
  const boxes: Box[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(VIEWPORT_CROP_OBSTACLES)) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  }
  return boxes;
}

export function visibleViewportRect(canvas: HTMLCanvasElement, obstacles: readonly Box[] = liveObstacleBoxes()): ViewportRect {
  const rect = canvas.getBoundingClientRect();
  const free = freeViewportBox({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, obstacles);
  const width = free.right - free.left;
  const height = free.bottom - free.top;
  if (width < 16 || height < 16) return { x: 0, y: 0, width: rect.width, height: rect.height };
  return { x: free.left - rect.left, y: free.top - rect.top, width, height };
}

export function opaqueColour(colour: string): string {
  const match = colour.match(/^(rgb)a?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (match) return `${match[1]}(${match[2]}, ${match[3]}, ${match[4]})`;
  return colour.replace(/\s*\/\s*[\d.%]+\s*\)$/, ")");
}

function readOverlayCanvases(canvas: HTMLCanvasElement): ViewportOverlayCanvas[] {
  const rect = canvas.getBoundingClientRect();
  const viewport = canvas.closest(".viewport") ?? canvas.parentElement;
  if (!viewport) return [];
  const overlays: ViewportOverlayCanvas[] = [];
  for (const overlay of viewport.querySelectorAll<HTMLCanvasElement>(".wind-plan-overlay canvas")) {
    if (overlay === canvas || overlay.width < 2 || overlay.height < 2) continue;
    const box = overlay.getBoundingClientRect();
    overlays.push({ canvas: overlay, x: box.left - rect.left, y: box.top - rect.top, width: box.width, height: box.height });
  }
  return overlays;
}

export function readViewportCapture(canvas: HTMLCanvasElement): ViewportCapture {
  const rect = canvas.getBoundingClientRect();
  const viewport = canvas.closest(".viewport") ?? canvas.parentElement;
  const background = viewport ? getComputedStyle(viewport).backgroundColor : "";
  const labels: ViewportOverlayLabel[] = [];
  for (const node of document.querySelectorAll<HTMLElement>(".landmark-label.is-visible")) {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    labels.push({
      text: node.textContent ?? "",
      x: box.left - rect.left,
      y: box.top - rect.top,
      width: box.width,
      height: box.height,
      font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      color: opaqueColour(style.color),
      fill: opaqueColour(style.backgroundColor),
      stroke: opaqueColour(style.borderTopColor),
      strokeWidth: parseFloat(style.borderTopWidth) || 0,
      radius: parseFloat(style.borderTopLeftRadius) || 0,
    });
  }
  return {
    background: background && background !== "rgba(0, 0, 0, 0)" ? background : null,
    labels,
    crop: visibleViewportRect(canvas),
    overlays: readOverlayCanvases(canvas),
  };
}

function drawLabel(context: CanvasRenderingContext2D, label: ViewportOverlayLabel, scale: number, dx: number, dy: number): void {
  const x = (label.x - dx) * scale;
  const y = (label.y - dy) * scale;
  const width = label.width * scale;
  const height = label.height * scale;
  context.globalAlpha = 1;
  context.beginPath();
  context.roundRect(x, y, width, height, label.radius * scale);
  context.fillStyle = opaqueColour(label.fill);
  context.fill();
  if (label.strokeWidth > 0) {
    context.lineWidth = label.strokeWidth * scale;
    context.strokeStyle = opaqueColour(label.stroke);
    context.stroke();
  }
  context.font = label.font.replace(/(\d+(?:\.\d+)?)px/, (_, px: string) => `${parseFloat(px) * scale}px`);
  context.fillStyle = opaqueColour(label.color);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillText(label.text, x + width / 2, y + height / 2);
  context.restore();
}

export function hqPixelRatio(cssWidth: number, cssHeight: number, requested: number, maxTexture: number): number {
  const limit = Math.min(maxTexture, HQ_MAX_TEXTURE_FALLBACK);
  const fit = Math.min(limit / Math.max(cssWidth, 1), limit / Math.max(cssHeight, 1));
  return Math.max(1, Math.min(requested, fit));
}

function maxTextureSize(gl: THREE.WebGLRenderer): number {
  try {
    const context = gl.getContext();
    const value = context.getParameter(context.MAX_TEXTURE_SIZE) as unknown;
    return typeof value === "number" && value > 0 ? value : HQ_MAX_TEXTURE_FALLBACK;
  } catch {
    return HQ_MAX_TEXTURE_FALLBACK;
  }
}

export function renderViewportWithOverlays(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
  const mask = camera.layers.mask;
  camera.layers.enable(POST_OVERLAY_LAYER);
  try {
    gl.render(scene, camera);
  } finally {
    camera.layers.mask = mask;
  }
}

export async function captureViewportPng(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  capture: ViewportCapture,
  options: ViewportPngOptions = {},
): Promise<Blob> {
  const source = gl.domElement;
  if (source.width < 2 || source.height < 2) throw new Error("The 3D view is not on screen.");
  const hq = options.transparent === true;
  const cssWidth = source.clientWidth || source.width;
  const cssHeight = source.clientHeight || source.height;
  const previousRatio = typeof gl.getPixelRatio === "function" ? gl.getPixelRatio() : 1;
  const previousBackground = scene.background;
  const previousAlpha = typeof gl.getClearAlpha === "function" ? gl.getClearAlpha() : 1;
  let ratio = source.width / cssWidth;
  if (hq) {
    ratio = hqPixelRatio(cssWidth, cssHeight, Math.max(2, options.scale ?? HQ_DEFAULT_SCALE), maxTextureSize(gl));
    gl.setPixelRatio(ratio);
    scene.background = null;
    gl.setClearAlpha(0);
  }
  try {
    renderViewportWithOverlays(gl, scene, camera);
    const bufferRatio = source.width / cssWidth;
    const crop = capture.crop ?? { x: 0, y: 0, width: cssWidth, height: cssHeight };
    const sx = Math.max(0, Math.round(crop.x * bufferRatio));
    const sy = Math.max(0, Math.round(crop.y * bufferRatio));
    const sw = Math.max(1, Math.min(source.width - sx, Math.round(crop.width * bufferRatio)));
    const sh = Math.max(1, Math.min(source.height - sy, Math.round(crop.height * bufferRatio)));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the PNG.");
    if (!hq && capture.background) {
      context.fillStyle = capture.background;
      context.fillRect(0, 0, sw, sh);
    }
    context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    for (const overlay of capture.overlays ?? []) {
      context.drawImage(
        overlay.canvas,
        (overlay.x - crop.x) * bufferRatio,
        (overlay.y - crop.y) * bufferRatio,
        overlay.width * bufferRatio,
        overlay.height * bufferRatio,
      );
    }
    for (const label of capture.labels) drawLabel(context, label, bufferRatio, crop.x, crop.y);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not encode the PNG.");
    return blob;
  } finally {
    if (hq) {
      scene.background = previousBackground;
      gl.setClearAlpha(previousAlpha);
      gl.setPixelRatio(previousRatio);
      renderViewportWithOverlays(gl, scene, camera);
    }
  }
}
