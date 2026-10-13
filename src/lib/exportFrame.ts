import * as THREE from "three";

/**
 * 3D exports (PNG, 3D view .ai) are framed on the whole model area, not just the part of it
 * the sidebar leaves visible. With the sidebar open or collapsed, a 1440 px window gives the
 * same export as a full-width canvas: the camera pose and zoom are the user's, only the frame
 * is wider. Nothing on screen changes; the export renders with a clone of the camera.
 */
export type ExportFrame = { width: number; height: number };

/** CSS pixel frame for a 3D export: the full width of the model area, the canvas height. */
export function exportFrameSize(canvas: HTMLElement): ExportFrame {
  const host = canvas.closest<HTMLElement>(".viewport");
  const width = Math.max(canvas.clientWidth, host?.clientWidth ?? 0);
  return { width, height: canvas.clientHeight };
}

/**
 * A copy of `camera` for an export frame of `width` × `height` CSS pixels.
 * Perspective keeps the vertical field of view and widens the aspect. Orthographic keeps the
 * zoom (pixels per metre) and widens the frustum, the way the on-screen camera is sized.
 * The camera passed in is never modified.
 */
export function cameraForExportFrame<T extends THREE.Camera>(camera: T, width: number, height: number): T {
  if (!(width >= 2) || !(height >= 2)) throw new Error("The 3D view is not on screen.");
  const copy = camera.clone() as T;
  // The on-screen view offset (floating sidebar inset) never goes into an export.
  const withView = copy as unknown as { view?: { enabled: boolean } | null; clearViewOffset?: () => void };
  if (withView.view?.enabled) withView.clearViewOffset?.();
  const persp = copy as unknown as THREE.PerspectiveCamera;
  const ortho = copy as unknown as THREE.OrthographicCamera;
  if (persp.isPerspectiveCamera) {
    persp.aspect = width / height;
    persp.updateProjectionMatrix();
  } else if (ortho.isOrthographicCamera) {
    ortho.left = width / -2;
    ortho.right = width / 2;
    ortho.top = height / 2;
    ortho.bottom = height / -2;
    ortho.updateProjectionMatrix();
  }
  copy.updateMatrixWorld(true);
  return copy;
}
