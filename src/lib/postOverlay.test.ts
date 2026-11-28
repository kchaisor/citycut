import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  POST_OVERLAY_LAYER,
  createDepthRestore,
  moveToPostOverlay,
  postOverlayUsers,
  renderPostOverlay,
  retainPostOverlay,
  setPostOverlayDeferred,
} from "./postOverlay";

function fakeRenderer() {
  const calls: { scene: THREE.Object3D; mask: number; autoClear: boolean; background: unknown; shadowAuto: boolean }[] = [];
  const gl = {
    autoClear: true,
    shadowMap: { autoUpdate: true, needsUpdate: true } as THREE.WebGLShadowMap,
    setRenderTarget: () => undefined,
    render(scene: THREE.Object3D, camera: THREE.Camera) {
      calls.push({
        scene,
        mask: camera.layers.mask,
        autoClear: gl.autoClear,
        background: (scene as THREE.Scene).background,
        shadowAuto: gl.shadowMap.autoUpdate,
      });
    },
  };
  return { gl, calls };
}

describe("post overlay", () => {
  it("moves a whole tree onto the overlay layer only", () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh();
    root.add(child);
    moveToPostOverlay(root);
    const camera = new THREE.PerspectiveCamera();
    expect(child.layers.test(camera.layers)).toBe(false);
    setPostOverlayDeferred(camera, false);
    expect(child.layers.test(camera.layers)).toBe(true);
    expect(camera.layers.isEnabled(0)).toBe(true);
    setPostOverlayDeferred(camera, true);
    expect(child.layers.test(camera.layers)).toBe(false);
  });

  it("counts overlay users per scene", () => {
    const scene = new THREE.Scene();
    const release = retainPostOverlay(scene);
    expect(postOverlayUsers(scene)).toBe(1);
    release();
    expect(postOverlayUsers(scene)).toBe(0);
  });

  it("restores scene depth, draws only the overlay layer, then puts everything back", () => {
    const { gl, calls } = fakeRenderer();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color();
    const camera = new THREE.PerspectiveCamera();
    const mask = camera.layers.mask;
    const restore = createDepthRestore();
    const depth = new THREE.DepthTexture(4, 4);
    renderPostOverlay(gl, scene, camera, restore, depth);
    expect(calls.map((call) => call.scene)).toEqual([restore.scene, scene]);
    expect(calls[1]!.mask).toBe(1 << POST_OVERLAY_LAYER);
    expect(calls[1]!.background).toBeNull();
    expect(calls.every((call) => !call.autoClear && !call.shadowAuto)).toBe(true);
    expect(camera.layers.mask).toBe(mask);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect(gl.autoClear).toBe(true);
    expect(gl.shadowMap.autoUpdate).toBe(true);
    expect(gl.shadowMap.needsUpdate).toBe(true);
    restore.dispose();
  });
});
