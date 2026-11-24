// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWindMaterial } from "../components/GroundWindFlow";
import { captureViewportPng } from "./captureViewportPng";
import {
  buildGroundWindGrid,
  GROUND_WIND_WATER_ALPHA,
  groundWindIsWater,
  groundWindWaterAlpha,
  groundWindWaterMask,
} from "./groundWindField";
import {
  createGroundWindStreaks,
  GROUND_WIND_VERTEX_STRIDE,
  GROUND_WIND_VERTS_PER_STREAK,
  groundWindMetresPerSecond,
  writeGroundWindStreakVertices,
} from "./groundWindStreaks";
import { SURFACE } from "./surfaceLayers";
import type { CityModel, Pt } from "../types";

vi.mock("./colours", () => ({ getColour: () => "#336699" }));

afterEach(() => vi.restoreAllMocks());

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function harbourModel(): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [],
    roads: [],
    areas: [{ kind: "water", ring: ring(-500, -500, 0, 500), holes: [] }],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  } as unknown as CityModel;
}

describe("Flow streaks over water", () => {
  it("fades streaks over water by a fixed factor and leaves land alone", () => {
    expect(groundWindWaterAlpha(false)).toBe(1);
    expect(groundWindWaterAlpha(true)).toBe(GROUND_WIND_WATER_ALPHA);
    expect(GROUND_WIND_WATER_ALPHA).toBeGreaterThan(0);
    expect(GROUND_WIND_WATER_ALPHA).toBeLessThan(1);
  });

  it("reads the water mask from the water areas", () => {
    const model = harbourModel();
    const grid = buildGroundWindGrid(model, 8);
    const obs = grid.obstacles;
    const mask = groundWindWaterMask(model, obs);
    expect(groundWindIsWater(obs, mask, -250, 0)).toBe(true);
    expect(groundWindIsWater(obs, mask, 250, 0)).toBe(false);
    expect(groundWindIsWater(obs, mask, 5000, 0)).toBe(false);
  });

  it("writes the same faded alpha to every vertex over water, whatever the view", () => {
    const model = harbourModel();
    const grid = buildGroundWindGrid(model, 8);
    const obs = grid.obstacles;
    const mask = groundWindWaterMask(model, obs);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    const streaks = createGroundWindStreaks(model, grid, () => 1.76, mps, 600);
    for (let p = 0; p < streaks.count; p++) streaks.age[p] = 1;
    const plain = streaks.vertices.slice();
    const drawnPlain = writeGroundWindStreakVertices(streaks);
    const reference = streaks.vertices.slice();
    const drawn = writeGroundWindStreakVertices(streaks, (e, n) => groundWindIsWater(obs, mask, e, n));
    expect(drawn).toBe(drawnPlain);
    expect(plain.length).toBe(streaks.vertices.length);
    let faded = 0;
    let full = 0;
    const stride = GROUND_WIND_VERTEX_STRIDE;
    for (let v = 0; v < drawn * GROUND_WIND_VERTS_PER_STREAK; v++) {
      const o = v * stride;
      const overWater = groundWindIsWater(obs, mask, streaks.vertices[o]!, -streaks.vertices[o + 2]!);
      const expected = reference[o + 7]! * groundWindWaterAlpha(overWater);
      expect(streaks.vertices[o + 7]).toBeCloseTo(expected, 6);
      if (overWater) faded++;
      else full++;
    }
    expect(faded).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(0);
  });

  it("draws with the water layer's polygon offset so water never hides streaks at any pixel ratio", () => {
    const material = makeWindMaterial(400, 300);
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(SURFACE.water.polygonOffsetFactor);
    expect(material.polygonOffsetUnits).toBe(SURFACE.water.polygonOffsetUnits);
  });
});

describe("linear capture depth buffer", () => {
  it("uses a 24-bit unsigned-int depth texture at the buffer size, like the canvas depth", async () => {
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob([new Uint8Array([1])], { type: "image/png" })),
    );
    const domElement = document.createElement("canvas");
    domElement.width = 400;
    domElement.height = 300;
    const targets: THREE.WebGLRenderTarget[] = [];
    const gl = {
      domElement,
      toneMapping: THREE.ACESFilmicToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
        if (target) targets.push(target);
      },
      render: () => undefined,
    } as unknown as THREE.WebGLRenderer;
    await captureViewportPng(gl, new THREE.Scene(), new THREE.PerspectiveCamera(), { background: null, labels: [] });
    const texture = targets[0]!.depthTexture!;
    expect(texture.type).toBe(THREE.UnsignedIntType);
    expect(texture.format).toBe(THREE.DepthFormat);
    expect(texture.image.width).toBe(400);
    expect(texture.image.height).toBe(300);
  });
});
