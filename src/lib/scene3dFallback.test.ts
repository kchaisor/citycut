import { describe, expect, it } from "vitest";
import { classifySceneFailure, sceneFallbackMessage } from "./scene3dFallback";

describe("classifySceneFailure", () => {
  it("detects WebGL context creation failures", () => {
    const detail = classifySceneFailure(new Error("Error creating WebGL context."));
    expect(detail.kind).toBe("webgl-unavailable");
    expect(sceneFallbackMessage(detail).lead).toMatch(/WebGL is unavailable/);
  });

  it("detects WebGL2-specific failures", () => {
    const detail = classifySceneFailure(new Error("WebGL2 is not supported in this environment"));
    expect(detail.kind).toBe("webgl2-unsupported");
  });

  it("detects context loss", () => {
    const detail = classifySceneFailure(new Error("THREE.WebGLRenderer: Context Lost."));
    expect(detail.kind).toBe("context-lost");
  });

  it("treats theme parse failures as scene build errors", () => {
    const detail = classifySceneFailure(new Error("theme.css is missing --model-bg"));
    expect(detail.kind).toBe("scene-build");
    expect(sceneFallbackMessage(detail).lead).toMatch(/failed to build/);
  });
});
