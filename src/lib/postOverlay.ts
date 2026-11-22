import * as THREE from "three";

export const POST_OVERLAY_LAYER = 30;
const POST_OVERLAY_USERS = "citycutPostOverlayUsers";

export function moveToPostOverlay(root: THREE.Object3D): void {
  root.traverse((object) => object.layers.set(POST_OVERLAY_LAYER));
}

export function retainPostOverlay(scene: THREE.Scene): () => void {
  scene.userData[POST_OVERLAY_USERS] = postOverlayUsers(scene) + 1;
  return () => {
    scene.userData[POST_OVERLAY_USERS] = Math.max(0, postOverlayUsers(scene) - 1);
  };
}

export function postOverlayUsers(scene: THREE.Scene): number {
  const users = scene.userData[POST_OVERLAY_USERS];
  return typeof users === "number" ? users : 0;
}

export function setPostOverlayDeferred(camera: THREE.Camera, deferred: boolean): void {
  if (deferred) camera.layers.disable(POST_OVERLAY_LAYER);
  else camera.layers.enable(POST_OVERLAY_LAYER);
}

export type DepthRestore = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  dispose: () => void;
};

export function createDepthRestore(): DepthRestore {
  const material = new THREE.ShaderMaterial({
    uniforms: { sceneDepth: { value: null } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "uniform sampler2D sceneDepth; varying vec2 vUv; void main() { gl_FragDepth = texture2D(sceneDepth, vUv).r; gl_FragColor = vec4(0.0); }",
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
    colorWrite: false,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  return {
    scene,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    material,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

type OverlayRenderer = Pick<THREE.WebGLRenderer, "autoClear" | "shadowMap" | "setRenderTarget" | "render">;

export function renderPostOverlay(
  gl: OverlayRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  restore: DepthRestore,
  sceneDepth: THREE.Texture,
): void {
  const mask = camera.layers.mask;
  const autoClear = gl.autoClear;
  const background = scene.background;
  const shadowAuto = gl.shadowMap.autoUpdate;
  const shadowNeeds = gl.shadowMap.needsUpdate;
  try {
    gl.autoClear = false;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = false;
    gl.setRenderTarget(null);
    restore.material.uniforms.sceneDepth!.value = sceneDepth;
    gl.render(restore.scene, restore.camera);
    scene.background = null;
    camera.layers.set(POST_OVERLAY_LAYER);
    gl.render(scene, camera);
  } finally {
    camera.layers.mask = mask;
    scene.background = background;
    gl.autoClear = autoClear;
    gl.shadowMap.autoUpdate = shadowAuto;
    gl.shadowMap.needsUpdate = shadowNeeds;
    restore.material.uniforms.sceneDepth!.value = null;
  }
}
