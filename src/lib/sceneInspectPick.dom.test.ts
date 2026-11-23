// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { attachSceneInspectPick } from "./sceneInspectPick";

function buildingRoot(buildingId: number): THREE.Object3D {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  mesh.userData.buildingId = buildingId;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function setup() {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  document.body.appendChild(host);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld(true);
  const onPick = vi.fn();
  const onClear = vi.fn();
  const controlsOnHost = vi.fn();
  const controlsOnCanvas = vi.fn();
  host.addEventListener("pointerdown", controlsOnHost);
  canvas.addEventListener("pointerdown", controlsOnCanvas);
  const detach = attachSceneInspectPick(canvas, camera, buildingRoot(7), { trees: [], sideM: 400 }, { onPick, onClear });
  return { host, canvas, onPick, onClear, controlsOnHost, controlsOnCanvas, detach };
}

function fire(canvas: HTMLCanvasElement, type: string, init: MouseEventInit) {
  canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("attachSceneInspectPick pointer handling", () => {
  it("keeps a Shift left press away from the camera controls and still picks", () => {
    const { canvas, onPick, controlsOnHost, controlsOnCanvas } = setup();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100, shiftKey: true });
    expect(controlsOnHost).not.toHaveBeenCalled();
    expect(controlsOnCanvas).not.toHaveBeenCalled();
    fire(canvas, "pointerup", { clientX: 106, clientY: 108, shiftKey: true });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ kind: "building", buildingId: 7, additive: true });
  });

  it("lets an ordinary left press reach the camera controls", () => {
    const { canvas, onPick, controlsOnHost, controlsOnCanvas } = setup();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100 });
    expect(controlsOnHost).toHaveBeenCalledTimes(1);
    expect(controlsOnCanvas).toHaveBeenCalledTimes(1);
    fire(canvas, "pointerup", { clientX: 106, clientY: 108 });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("lets Shift with the right or middle button reach the camera controls", () => {
    const { canvas, controlsOnHost } = setup();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100, shiftKey: true, button: 2 });
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100, shiftKey: true, button: 1 });
    expect(controlsOnHost).toHaveBeenCalledTimes(2);
  });

  it("ignores a Shift drag well past the jitter cap", () => {
    const { canvas, onPick, onClear } = setup();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100, shiftKey: true });
    fire(canvas, "pointerup", { clientX: 140, clientY: 100, shiftKey: true });
    expect(onPick).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("uses the strict cap when Shift is only pressed after the drag began", () => {
    const { canvas, onPick } = setup();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100 });
    fire(canvas, "pointerup", { clientX: 110, clientY: 100, shiftKey: true });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("stops intercepting once detached", () => {
    const { canvas, controlsOnHost, detach } = setup();
    detach();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 100, shiftKey: true });
    expect(controlsOnHost).toHaveBeenCalledTimes(1);
  });
});
