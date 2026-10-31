import * as THREE from "three";

const scratch = new THREE.Vector3();

export function screenConstantHitRadiusM(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  pixelRadius: number,
  canvasHeightPx: number,
): number {
  const h = Math.max(1, canvasHeightPx);
  if (camera instanceof THREE.OrthographicCamera) {
    const span = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
    return (pixelRadius / h) * span;
  }
  scratch.copy(worldPoint).sub(camera.position);
  const distance = scratch.length();
  const persp = camera as THREE.PerspectiveCamera;
  const vFov = THREE.MathUtils.degToRad(persp.fov);
  const worldPerPx = (2 * Math.tan(vFov / 2) * distance) / h;
  return pixelRadius * worldPerPx;
}

export function projectToCanvasPixels(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  canvas: HTMLCanvasElement,
): { x: number; y: number; behind: boolean } | null {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return null;
  scratch.copy(worldPoint).project(camera);
  if (scratch.z > 1) return { x: 0, y: 0, behind: true };
  return {
    x: ((scratch.x + 1) / 2) * w,
    y: ((1 - scratch.y) / 2) * h,
    behind: false,
  };
}

export type SectionKnifeGizmoInteraction = {
  orbitLock: boolean;
  cursor: "default" | "grab" | "grabbing";
};

export const idleSectionKnifeGizmoInteraction: SectionKnifeGizmoInteraction = {
  orbitLock: false,
  cursor: "default",
};
