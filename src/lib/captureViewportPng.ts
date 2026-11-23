import type * as THREE from "three";

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

export type ViewportCapture = {
  background: string | null;
  labels: readonly ViewportOverlayLabel[];
};

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
      color: style.color,
      fill: style.backgroundColor,
      stroke: style.borderTopColor,
      strokeWidth: parseFloat(style.borderTopWidth) || 0,
      radius: parseFloat(style.borderTopLeftRadius) || 0,
    });
  }
  return { background: background && background !== "rgba(0, 0, 0, 0)" ? background : null, labels };
}

function drawLabel(context: CanvasRenderingContext2D, label: ViewportOverlayLabel, scale: number): void {
  const x = label.x * scale;
  const y = label.y * scale;
  const width = label.width * scale;
  const height = label.height * scale;
  context.beginPath();
  context.roundRect(x, y, width, height, label.radius * scale);
  context.fillStyle = label.fill;
  context.fill();
  if (label.strokeWidth > 0) {
    context.lineWidth = label.strokeWidth * scale;
    context.strokeStyle = label.stroke;
    context.stroke();
  }
  context.font = label.font.replace(/(\d+(?:\.\d+)?)px/, (_, px: string) => `${parseFloat(px) * scale}px`);
  context.fillStyle = label.color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillText(label.text, x + width / 2, y + height / 2);
  context.restore();
}

export async function captureViewportPng(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  capture: ViewportCapture,
): Promise<Blob> {
  const source = gl.domElement;
  const width = source.width;
  const height = source.height;
  if (width < 2 || height < 2) throw new Error("The 3D view is not on screen.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the PNG.");
  if (capture.background) {
    context.fillStyle = capture.background;
    context.fillRect(0, 0, width, height);
  }
  gl.render(scene, camera);
  context.drawImage(source, 0, 0);
  const cssWidth = source.clientWidth || width;
  const scale = width / cssWidth;
  for (const label of capture.labels) drawLabel(context, label, scale);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the PNG.");
  return blob;
}
