// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWindMaterial } from "../components/GroundWindFlow";
import { captureViewportPng } from "./captureViewportPng";

vi.mock("./colours", () => ({ getColour: () => "#336699" }));

afterEach(() => vi.restoreAllMocks());

describe("wind Flow output settings in the named-view capture", () => {
  it("renders the wind material into the linear target and tone-maps and encodes once in the canvas output pass", async () => {
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob([new Uint8Array([1])], { type: "image/png" })),
    );
    const domElement = document.createElement("canvas");
    domElement.width = 400;
    domElement.height = 300;
    const seen: { toneMapped: boolean; target: unknown; toneMapping: number; colourSpace: string }[] = [];
    const passes: { toneMapped: boolean; target: unknown }[] = [];
    let current: THREE.WebGLRenderTarget | null = null;
    const material = makeWindMaterial(400, 300);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    const gl = {
      domElement,
      toneMapping: THREE.ACESFilmicToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      autoClear: true,
      getRenderTarget: () => current,
      setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
        current = target;
      },
      render: (rendered: THREE.Scene) => {
        const pass = rendered.children[0] as THREE.Mesh | undefined;
        if (pass && (pass.material as THREE.ShaderMaterial).uniforms?.tColour) {
          passes.push({ toneMapped: (pass.material as THREE.ShaderMaterial).toneMapped, target: current });
        }
        rendered.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.material === material) {
            seen.push({
              toneMapped: material.toneMapped,
              target: gl.getRenderTarget(),
              toneMapping: gl.toneMapping,
              colourSpace: gl.outputColorSpace,
            });
          }
        });
      },
    } as unknown as THREE.WebGLRenderer;
    await captureViewportPng(gl, scene, new THREE.PerspectiveCamera(), { background: null, labels: [] });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.target).not.toBeNull();
    expect(seen[0]!.toneMapped).toBe(true);
    expect(passes).toEqual([{ toneMapped: true, target: null }]);
  });

  it("uses the same material, which three tone-maps only when drawing to the canvas", () => {
    const material = makeWindMaterial(400, 300);
    expect(material.toneMapped).toBe(true);
    expect(material.fragmentShader.match(/#include <(?:tonemapping|colorspace)_fragment>/g)).toHaveLength(2);
  });
});
