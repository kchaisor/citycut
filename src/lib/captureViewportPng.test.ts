// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureViewportPng, readViewportCapture } from "./captureViewportPng";
import { markScreenOnly } from "./screenOnly";

const guards = vi.hoisted(() => ({
  withScreenOnlyHidden: vi.fn(),
  cameraForExportFrame: vi.fn(),
  withStreamStillFrame: vi.fn(),
  getColour: vi.fn(),
}));
vi.mock("./screenOnly", async (original) => ({
  ...(await original<typeof import("./screenOnly")>()),
  withScreenOnlyHidden: guards.withScreenOnlyHidden,
}));
vi.mock("./exportFrame", () => ({ cameraForExportFrame: guards.cameraForExportFrame }));
vi.mock("./windDiagramStreams", () => ({ withStreamStillFrame: guards.withStreamStillFrame }));
vi.mock("./colours", () => ({ getColour: guards.getColour }));

type Stub = { drawn: unknown[]; fills: string[] };

function stubCanvas(): Stub {
  const stub: Stub = { drawn: [], fills: [] };
  const context = {
    fillRect: vi.fn(),
    drawImage: (image: unknown) => stub.drawn.push(image),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    fillText: vi.fn(),
    set fillStyle(value: string) {
      stub.fills.push(value);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
    callback(new Blob([new Uint8Array([1])], { type: "image/png" })),
  );
  return stub;
}

function renderer(order: string[]) {
  const domElement = document.createElement("canvas");
  domElement.width = 400;
  domElement.height = 300;
  const gl = {
    domElement,
    render: vi.fn((_scene: THREE.Scene, _camera: THREE.Camera): void => {
      order.push("render");
    }),
  };
  return { gl: gl as unknown as THREE.WebGLRenderer, render: gl.render, domElement };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  for (const guard of Object.values(guards)) guard.mockClear();
});

describe("captureViewportPng", () => {
  it("renders the live camera and scene as displayed, without the publication pipeline", async () => {
    const stub = stubCanvas();
    const order: string[] = [];
    const { gl, render, domElement } = renderer(order);
    const scene = new THREE.Scene();
    const dome = new THREE.Group();
    markScreenOnly(dome);
    scene.add(dome);
    const background = new THREE.Color(0.2, 0.3, 0.4);
    scene.background = background;
    const camera = new THREE.PerspectiveCamera(37, 4 / 3);
    let domeVisible: boolean | null = null;
    render.mockImplementation(() => {
      order.push("render");
      domeVisible = dome.visible;
    });

    const blob = await captureViewportPng(gl, scene, camera, { background: "rgb(1, 2, 3)", labels: [] });

    expect(blob.type).toBe("image/png");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![0]).toBe(scene);
    expect(render.mock.calls[0]![1]).toBe(camera);
    expect(domeVisible).toBe(true);
    expect(scene.background).toBe(background);
    expect(stub.drawn).toEqual([domElement]);
    expect(stub.fills).toContain("rgb(1, 2, 3)");
    expect(guards.withScreenOnlyHidden).not.toHaveBeenCalled();
    expect(guards.cameraForExportFrame).not.toHaveBeenCalled();
    expect(guards.withStreamStillFrame).not.toHaveBeenCalled();
    expect(guards.getColour).not.toHaveBeenCalled();
  });

  it("rejects a canvas that is not on screen", async () => {
    stubCanvas();
    const { gl, domElement } = renderer([]);
    domElement.width = 0;
    await expect(
      captureViewportPng(gl, new THREE.Scene(), new THREE.PerspectiveCamera(), { background: null, labels: [] }),
    ).rejects.toThrow("not on screen");
  });
});

describe("readViewportCapture", () => {
  it("reads the viewport background and only the visible live labels", () => {
    document.body.innerHTML = `
      <div class="viewport" style="background-color: rgb(250, 250, 250)"><canvas id="c"></canvas></div>
      <div class="landmark-label-layer">
        <button class="landmark-label is-visible">Flinders</button>
        <button class="landmark-label">Hidden</button>
      </div>`;
    const capture = readViewportCapture(document.getElementById("c") as HTMLCanvasElement);
    expect(capture.background).toBe("rgb(250, 250, 250)");
    expect(capture.labels.map((label) => label.text)).toEqual(["Flinders"]);
  });
});
