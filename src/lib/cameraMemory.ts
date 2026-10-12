import type * as THREE from "three";

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

/** One camera plus its OrbitControls target, copied by value. */
export type CameraPose = {
  position: V3;
  quaternion: Q4;
  up: V3;
  target: V3;
  zoom: number;
  near: number;
  far: number;
  /** Perspective only. */
  fov?: number;
};

/**
 * The 3D view's camera state, kept by the model page while the 3D tab is unmounted
 * (Drawing or Satellite), so returning to 3D puts back exactly what the user left.
 * Both cameras are kept so a projection switch after the round trip also finds its own pose.
 * The fit keys and the "user moved the camera" flag are kept too, so the auto-fit logic
 * (snap id, #81 resize rules) behaves as if the view had never been torn down.
 */
export type CameraMemory = {
  snapId: number;
  persp: CameraPose;
  ortho: CameraPose;
  fittedKeys: { persp: string | null; iso: string | null; plan: string | null };
  touched: boolean;
};

export type CameraMemoryRef = { current: CameraMemory | null };

type ControlsLike = { target: THREE.Vector3 };

export function capturePose(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, controls: ControlsLike): CameraPose {
  const p = camera.position;
  const q = camera.quaternion;
  const pose: CameraPose = {
    position: [p.x, p.y, p.z],
    quaternion: [q.x, q.y, q.z, q.w],
    up: [camera.up.x, camera.up.y, camera.up.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  };
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) pose.fov = (camera as THREE.PerspectiveCamera).fov;
  return pose;
}

/** Write a pose back. Does not call controls.update(); the caller flushes inertia first. */
export function applyPose(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: ControlsLike,
  pose: CameraPose,
): void {
  camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
  camera.quaternion.set(pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3]);
  camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
  camera.zoom = pose.zoom;
  camera.near = pose.near;
  camera.far = pose.far;
  if (pose.fov !== undefined && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    (camera as THREE.PerspectiveCamera).fov = pose.fov;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
}

/** Memory is only reused for the same snap id; a new snap (or a new model page) frames afresh. */
export function usableCameraMemory(memory: CameraMemory | null, snapId: number): CameraMemory | null {
  return memory && memory.snapId === snapId ? memory : null;
}
