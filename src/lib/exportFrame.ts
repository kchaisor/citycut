import * as THREE from "three";

export type ExportFrame = { width: number; height: number };

export function exportFrameSize(canvas: HTMLElement): ExportFrame {
  const host = canvas.closest<HTMLElement>(".viewport");
  const width = Math.max(canvas.clientWidth, host?.clientWidth ?? 0);
  return { width, height: canvas.clientHeight };
}

export function cameraForExportFrame<T extends THREE.Camera>(camera: T, width: number, height: number): T {
  if (!(width >= 2) || !(height >= 2)) throw new Error("The 3D view is not on screen.");
  const copy = camera.clone() as T;
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
