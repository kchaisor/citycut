import * as THREE from "three";
import { makeWindMaterial } from "../components/GroundWindFlow";
import { createOutputPass } from "./captureViewportPng";
import { createRippleNetworkRibbonMaterial, rippleColourUniforms } from "./walkRippleShader";

export const SCENE_SHADER_MATERIAL_FACTORIES: Readonly<Record<string, () => THREE.ShaderMaterial>> = {
  "src/components/GroundWindFlow.tsx": () => makeWindMaterial(800, 600),
  "src/lib/captureViewportPng.ts": () => createOutputPass().material,
  "src/lib/walkRippleShader.ts": () => createRippleNetworkRibbonMaterial(rippleColourUniforms()),
};

export const NON_COLOUR_SHADER_MATERIAL_FILES: readonly string[] = ["src/lib/postOverlay.ts"];
