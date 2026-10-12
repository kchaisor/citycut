import * as THREE from "three";
import { getColour } from "./colours";
import { withScreenOnlyHidden } from "./screenOnly";
import { cameraForExportFrame, type ExportFrame } from "./exportFrame";

/**
 * Renders the current view into an offscreen target twice the frame's bitmap size on each
 * side and returns a PNG. The on-screen buffer and camera are left alone, so
 * preserveDrawingBuffer is not required and nothing flickers.
 *
 * `frame` is the export frame in CSS pixels (see exportFrame.ts): the whole model area, so the
 * PNG is as wide as the window whether or not the sidebar covers part of it. Without it, the
 * canvas size is used.
 */
export async function captureViewPng(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  frame?: ExportFrame,
): Promise<Blob> {
  // The on-screen clear colour comes from the theme. The PNG keeps the
  // previous backdrop so a theme edit does not change the download.
  const PNG_BACKGROUND = getColour("--export-backdrop");
  const previousBackground = scene.background;
  const pixelRatio = gl.getPixelRatio();
  const sourceWidth = frame ? Math.round(frame.width * pixelRatio) : gl.domElement.width;
  const sourceHeight = frame ? Math.round(frame.height * pixelRatio) : gl.domElement.height;
  if (sourceWidth < 2 || sourceHeight < 2) {
    throw new Error("The 3D view is not on screen.");
  }
  const renderCamera = frame ? cameraForExportFrame(camera, frame.width, frame.height) : camera;
  scene.background = new THREE.Color(PNG_BACKGROUND);
  const width = sourceWidth * 2;
  const height = sourceHeight * 2;
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const previous = gl.getRenderTarget();
  const pixels = new Uint8Array(width * height * 4);
  try {
    gl.setRenderTarget(target);
    withScreenOnlyHidden(scene, () => {
      gl.render(scene, renderCamera);
    });
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    scene.background = previousBackground;
    gl.setRenderTarget(previous);
    target.dispose();
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the PNG.");
  const image = context.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * row;
    image.data.set(pixels.subarray(src, src + row), y * row);
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the PNG.");
  return blob;
}
