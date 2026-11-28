// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureViewportPng,
  freeViewportBox,
  hqPixelRatio,
  opaqueColour,
  readViewportCapture,
  sheetCropRect,
  visibleViewportRect,
} from "./captureViewportPng";
import { POST_OVERLAY_LAYER, moveToPostOverlay, retainPostOverlay, setPostOverlayDeferred } from "./postOverlay";
import { registerStaticPlanArrows } from "./diagramArrowsPlanDraw";
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

const passStubs = () => ({
  autoClear: true,
  toneMapping: THREE.ACESFilmicToneMapping,
  shadowMap: { autoUpdate: true, needsUpdate: false },
  setRenderTarget: vi.fn(),
  clearDepth: vi.fn(),
});

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
    ...passStubs(),
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
    expect(render).toHaveBeenCalledTimes(2);
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

  it("renders post-overlay objects (sun dome, wind streaks) even when the live camera defers them", async () => {
    stubCanvas();
    const { gl, render } = renderer([]);
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh();
    const streaks = new THREE.Group();
    streaks.add(new THREE.Mesh());
    moveToPostOverlay(dome);
    moveToPostOverlay(streaks);
    const body = new THREE.Mesh();
    scene.add(dome, streaks, body);
    const camera = new THREE.PerspectiveCamera();
    setPostOverlayDeferred(camera, true);
    const maskBefore = camera.layers.mask;
    const seen: Array<{ dome: boolean; streaks: boolean; body: boolean }> = [];
    render.mockImplementation((drawn: THREE.Scene, live: THREE.Camera) => {
      if (drawn !== scene) return;
      seen.push({
        dome: live.layers.test(dome.layers),
        streaks: live.layers.test(streaks.children[0]!.layers),
        body: live.layers.test(body.layers),
      });
    });

    await captureViewportPng(gl, scene, camera, { background: null, labels: [] });

    expect(seen).toEqual([{ dome: true, streaks: true, body: true }]);
    expect(camera.layers.isEnabled(POST_OVERLAY_LAYER)).toBe(false);
    expect(camera.layers.mask).toBe(maskBefore);
    expect(dome.visible).toBe(true);
  });

  it("blends the scene in a linear half-float target, then writes it to the canvas with the renderer's tone mapping and no blending", async () => {
    stubCanvas();
    const { gl, render, domElement } = renderer([]);
    const raw = gl as unknown as ReturnType<typeof passStubs>;
    const disposed: string[] = [];
    vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose").mockImplementation(() => void disposed.push("target"));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const seen: Array<{ target: THREE.WebGLRenderTarget | null; material?: THREE.ShaderMaterial; autoClear: boolean }> = [];
    let current: THREE.WebGLRenderTarget | null = null;
    raw.setRenderTarget.mockImplementation((target: THREE.WebGLRenderTarget | null) => void (current = target));
    render.mockImplementation((drawn: THREE.Scene) => {
      const quad = drawn.children[0] as THREE.Mesh | undefined;
      seen.push({
        target: current,
        material: drawn === scene ? undefined : (quad?.material as THREE.ShaderMaterial),
        autoClear: raw.autoClear,
      });
    });

    await captureViewportPng(gl, scene, camera, { background: null, labels: [] });

    expect(seen).toHaveLength(2);
    const [main, output] = seen;
    expect(main!.target).not.toBeNull();
    expect(main!.target!.texture.type).toBe(THREE.HalfFloatType);
    expect(main!.target!.texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(main!.target!.width).toBe(domElement.width);
    expect(output!.target).toBeNull();
    expect(output!.autoClear).toBe(false);
    expect(output!.material!.blending).toBe(THREE.NoBlending);
    expect(output!.material!.toneMapped).toBe(true);
    expect(output!.material!.fragmentShader).toContain("#include <tonemapping_fragment>");
    expect(output!.material!.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(raw.autoClear).toBe(true);
    expect(disposed).toEqual(["target"]);
  });

  it("draws the deferred post-overlay objects after the output pass, on the target depth", async () => {
    stubCanvas();
    const { gl, render } = renderer([]);
    const scene = new THREE.Scene();
    const streaks = new THREE.Mesh();
    moveToPostOverlay(streaks);
    scene.add(streaks);
    retainPostOverlay(scene);
    const camera = new THREE.PerspectiveCamera();
    const calls: string[] = [];
    render.mockImplementation((drawn: THREE.Scene, live: THREE.Camera) => {
      if (drawn !== scene) {
        calls.push(drawn.children[0] === streaks ? "streaks" : "pass");
        return;
      }
      calls.push(live.layers.test(streaks.layers) ? "scene+streaks" : "scene");
    });

    await captureViewportPng(gl, scene, camera, { background: null, labels: [] });

    expect(calls).toEqual(["scene", "pass", "pass", "scene+streaks"]);
    expect((gl as unknown as ReturnType<typeof passStubs>).clearDepth).toHaveBeenCalledTimes(1);
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

  it("composites a static snapshot of the registered Plan arrow canvas, not the live animated one", () => {
    document.body.innerHTML = `
      <div class="viewport"><canvas id="c"></canvas>
      <div class="wind-plan-overlay"><canvas id="plan" width="40" height="40"></canvas></div></div>`;
    const plan = document.getElementById("plan") as HTMLCanvasElement;
    const paint = vi.fn((target: HTMLCanvasElement) => {
      target.width = 40;
      target.height = 40;
    });
    const unregister = registerStaticPlanArrows(plan, paint);
    const capture = readViewportCapture(document.getElementById("c") as HTMLCanvasElement);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(capture.overlays).toHaveLength(1);
    expect(capture.overlays?.[0].canvas).not.toBe(plan);
    unregister();
    expect(readViewportCapture(document.getElementById("c") as HTMLCanvasElement).overlays?.[0].canvas).toBe(plan);
  });

  it("reads the exploded axo layer labels and leaders once they are showing", () => {
    document.body.innerHTML = `
      <div class="viewport"><canvas id="c"></canvas></div>
      <svg><line class="explode-leader" x1="10" y1="20" x2="40" y2="50" style="opacity: 1; stroke: rgb(10, 20, 30); stroke-width: 1px"></line>
      <line class="explode-leader" x1="0" y1="0" x2="5" y2="5" style="opacity: 0"></line></svg>
      <div class="explode-layer-label" style="opacity: 1">Ground</div>
      <div class="explode-layer-label" style="opacity: 0">Trees</div>`;
    const capture = readViewportCapture(document.getElementById("c") as HTMLCanvasElement);
    expect(capture.labels.map((label) => label.text)).toEqual(["Ground"]);
    expect(capture.lines).toEqual([{ x1: 10, y1: 20, x2: 40, y2: 50, colour: "rgb(10, 20, 30)", width: 1 }]);
  });
});

describe("visibleViewportRect", () => {
  function canvasAt(left: number, top: number, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () =>
      ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top }) as DOMRect;
    return canvas;
  }

  it("keeps the free area between the left rail, right cards, top bar and bottom bar", () => {
    const canvas = canvasAt(0, 0, 1440, 900);
    const rect = visibleViewportRect(canvas, [
      { left: 0, top: 0, right: 360, bottom: 900 },
      { left: 1100, top: 60, right: 1440, bottom: 900 },
      { left: 0, top: 0, right: 1440, bottom: 56 },
      { left: 360, top: 820, right: 1100, bottom: 900 },
    ]);
    expect(rect).toEqual({ x: 360, y: 56, width: 740, height: 764 });
  });

  it("ignores obstacles outside the canvas and falls back to the full canvas when nothing is left", () => {
    const canvas = canvasAt(100, 50, 800, 600);
    expect(visibleViewportRect(canvas, [{ left: 2000, top: 0, right: 2100, bottom: 100 }])).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(visibleViewportRect(canvas, [{ left: 0, top: 0, right: 2000, bottom: 2000 }])).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it("cuts a card floating on one edge from the side that loses least", () => {
    const free = freeViewportBox({ left: 0, top: 0, right: 1000, bottom: 800 }, [{ left: 0, top: 100, right: 200, bottom: 700 }]);
    expect(free).toEqual({ left: 200, top: 0, right: 1000, bottom: 800 });
  });
});

describe("high quality capture", () => {
  function hqRenderer() {
    const domElement = document.createElement("canvas");
    Object.defineProperty(domElement, "clientWidth", { value: 400 });
    Object.defineProperty(domElement, "clientHeight", { value: 300 });
    domElement.width = 400;
    domElement.height = 300;
    let ratio = 1;
    const log: string[] = [];
    const gl = {
      ...passStubs(),
      domElement,
      getPixelRatio: () => ratio,
      setPixelRatio: vi.fn((next: number) => {
        ratio = next;
        domElement.width = 400 * next;
        domElement.height = 300 * next;
        log.push(`ratio:${next}`);
      }),
      getClearAlpha: () => 1,
      setClearAlpha: vi.fn((alpha: number) => log.push(`alpha:${alpha}`)),
      getContext: () => ({ MAX_TEXTURE_SIZE: 1, getParameter: () => 8192 }),
      render: vi.fn((scene: THREE.Scene) => log.push(`render:${scene.background === null ? "clear" : "bg"}`)),
    };
    return { gl: gl as unknown as THREE.WebGLRenderer, raw: gl, domElement, log };
  }

  it("renders at 3x on a transparent clear, crops at that scale and restores the scene", async () => {
    const drawn: number[][] = [];
    const fills: string[] = [];
    const sizes: Array<[number, number]> = [];
    const context = {
      fillRect: vi.fn(),
      drawImage: (...args: unknown[]) => drawn.push(args.slice(1).map(Number)),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
      fillText: vi.fn(),
      globalAlpha: 1,
      set fillStyle(value: string) {
        fills.push(value);
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      return context as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob([new Uint8Array([1])], { type: "image/png" })),
    );
    const { gl, raw, log } = hqRenderer();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0.9, 0.9, 0.9);
    const original = scene.background;

    await captureViewportPng(
      gl,
      scene,
      new THREE.PerspectiveCamera(),
      {
        background: "rgb(250, 250, 250)",
        crop: { x: 100, y: 50, width: 200, height: 100 },
        labels: [
          { text: "88 m", x: 150, y: 80, width: 40, height: 20, font: "500 12px sans-serif", color: "rgba(10, 10, 10, 0.4)", fill: "rgba(255, 255, 255, 0.5)", stroke: "rgb(0, 0, 0)", strokeWidth: 0, radius: 4 },
        ],
      },
      { transparent: true, scale: 3 },
    );

    expect(raw.setPixelRatio.mock.calls[0]![0]).toBe(3);
    expect(log.slice(0, 2)).toEqual(["ratio:3", "alpha:0"]);
    expect(log).toContain("render:clear");
    expect(drawn[0]).toEqual([300, 150, 600, 300, 0, 0, 600, 300]);
    expect(sizes.at(-1)).toEqual([600, 300]);
    expect(fills).not.toContain("rgb(250, 250, 250)");
    expect(fills).toContain("rgb(255, 255, 255)");
    expect(fills).toContain("rgb(10, 10, 10)");
    expect(scene.background).toBe(original);
    expect(raw.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(raw.setClearAlpha).toHaveBeenLastCalledWith(1);
    expect(log.indexOf("alpha:0")).toBeLessThan(log.indexOf("render:clear"));
    expect(log.indexOf("render:clear")).toBeLessThan(log.indexOf("alpha:1"));
  });

  it("renders post-overlay objects in the high quality capture and in the restoring frame", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob([new Uint8Array([1])], { type: "image/png" })),
    );
    const { gl, raw } = hqRenderer();
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh();
    moveToPostOverlay(dome);
    scene.add(dome);
    const camera = new THREE.PerspectiveCamera();
    setPostOverlayDeferred(camera, true);
    const seen: boolean[] = [];
    (raw.render as unknown as ReturnType<typeof vi.fn>).mockImplementation((drawn: THREE.Scene, live: THREE.Camera) => {
      if (drawn !== scene) return;
      seen.push(live.layers.test(dome.layers));
    });

    await captureViewportPng(gl, scene, camera, { background: null, labels: [] }, { transparent: true, scale: 3 });

    expect(seen).toEqual([true, true]);
    expect(camera.layers.isEnabled(POST_OVERLAY_LAYER)).toBe(false);
  });

  it("caps the pixel ratio by the texture limit and crops the normal export at 1x", () => {
    expect(hqPixelRatio(400, 300, 3, 8192)).toBe(3);
    expect(hqPixelRatio(4000, 3000, 3, 8192)).toBeCloseTo(2.048);
    expect(hqPixelRatio(4000, 3000, 3, 4096)).toBeCloseTo(1.024);
  });

  it("crops the sheet to the main area's aspect, as large as fits, centred on the free rect", () => {
    const canvas = { width: 1200, height: 800 };
    const free = { x: 300, y: 80, width: 700, height: 640 };
    const crop = sheetCropRect(canvas, free, 1.5);
    expect(crop.width / crop.height).toBeCloseTo(1.5, 6);
    expect(crop.width).toBeCloseTo(1200, 6);
    expect(crop.x).toBeCloseTo(0, 6);
    expect(crop.y).toBeCloseTo(0, 6);
    const tall = sheetCropRect(canvas, { x: 0, y: 0, width: 1200, height: 800 }, 1);
    expect(tall).toEqual({ x: 200, y: 0, width: 800, height: 800 });
    const shifted = sheetCropRect(canvas, { x: 600, y: 0, width: 600, height: 800 }, 1);
    expect(shifted).toEqual({ x: 400, y: 0, width: 800, height: 800 });
  });

  it("renders a sheet capture at a ratio that reaches the requested pixel width and restores the ratio", async () => {
    stubCanvas();
    const { gl, raw } = hqRenderer();
    const free = { x: 100, y: 0, width: 300, height: 300 };
    await captureViewportPng(gl, new THREE.Scene(), new THREE.PerspectiveCamera(), { background: null, labels: [], crop: free }, { crop: { aspect: 1, minWidthPx: 900 } });
    expect(raw.setPixelRatio).toHaveBeenCalledWith(3);
    expect(raw.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(raw.setClearAlpha).not.toHaveBeenCalled();
  });

  it("caps a sheet capture at the texture limit", async () => {
    stubCanvas();
    const { gl, raw } = hqRenderer();
    await captureViewportPng(gl, new THREE.Scene(), new THREE.PerspectiveCamera(), { background: null, labels: [] }, { crop: { aspect: 1, minWidthPx: 100000 } });
    const ratio = (raw.setPixelRatio as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as number;
    expect(ratio * 400).toBeLessThanOrEqual(8192);
  });

  it("keeps the existing crop and pixel ratio when no sheet crop is asked for", async () => {
    stubCanvas();
    const { gl, raw } = hqRenderer();
    await captureViewportPng(gl, new THREE.Scene(), new THREE.PerspectiveCamera(), { background: null, labels: [] }, { crop: "free" });
    expect(raw.setPixelRatio).not.toHaveBeenCalled();
  });

  it("paints label colours at full opacity", () => {
    expect(opaqueColour("rgba(255, 255, 255, 0.4)")).toBe("rgb(255, 255, 255)");
    expect(opaqueColour("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(opaqueColour("color(srgb 1 1 1 / 0.5)")).toBe("color(srgb 1 1 1)");
  });
});
