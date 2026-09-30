import * as THREE from "three";

/** The camera that is on screen, in a form the vector export can project. */
export type CameraShot = {
  /** Column-major projectionMatrix × matrixWorldInverse. Clip = M × world. */
  projectionView: number[];
  position: [number, number, number];
  /** World direction the camera looks along. */
  forward: [number, number, number];
  /** CSS pixel size of the canvas. The page uses this aspect ratio. */
  width: number;
  height: number;
  kind: "perspective" | "orthographic";
};

export function shotFromCamera(camera: THREE.Camera, width: number, height: number): CameraShot {
  if (!(width >= 2) || !(height >= 2)) throw new Error("The 3D view is not on screen.");
  camera.updateMatrixWorld();
  const projective = camera as THREE.PerspectiveCamera;
  projective.updateProjectionMatrix?.();
  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  camera.getWorldPosition(position);
  camera.getWorldDirection(forward);
  const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
  return {
    projectionView: pv.toArray(),
    position: [position.x, position.y, position.z],
    forward: [forward.x, forward.y, forward.z],
    width,
    height,
    kind: ortho ? "orthographic" : "perspective",
  };
}
