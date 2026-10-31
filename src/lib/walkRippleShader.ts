import * as THREE from "three";
import { getColour } from "./colours";

export type RippleShaderUniforms = {
  uRippleTime: { value: number };
  uBand0: { value: THREE.Color };
  uBand1: { value: THREE.Color };
  uBand2: { value: THREE.Color };
  uAccent: { value: THREE.Color };
  uMaxMin: { value: number };
};

export function rippleColourUniforms(): RippleShaderUniforms {
  return {
    uRippleTime: { value: -1 },
    uBand0: { value: new THREE.Color(getColour("--walk-ripple-band-0")) },
    uBand1: { value: new THREE.Color(getColour("--walk-ripple-band-1")) },
    uBand2: { value: new THREE.Color(getColour("--walk-ripple-band-2")) },
    uAccent: { value: new THREE.Color(getColour("--walk-ripple-accent")) },
    uMaxMin: { value: 15 },
  };
}

const RIPPLE_BUILDING_PARS = `
  attribute float aRippleArrival;
  uniform float uRippleTime;
  uniform float uMaxMin;
  uniform vec3 uBand0;
  uniform vec3 uBand1;
  uniform vec3 uBand2;
  uniform vec3 uAccent;
`;

const RIPPLE_BUILDING_COLOR = `
  vec3 rippleBandColour(float arrival) {
    if (arrival <= 5.0) return uBand0;
    if (arrival <= 10.0) return uBand1;
    return uBand2;
  }
  vec3 applyRippleBuilding(vec3 base, float arrival) {
    if (uRippleTime < 0.0 || arrival > uMaxMin + 0.01) return base;
    if (uRippleTime < arrival - 0.05) return base;
    vec3 band = rippleBandColour(arrival);
    float lit = uRippleTime >= arrival ? 1.0 : 0.0;
    float pulse = exp(-pow((uRippleTime - arrival) * 8.0, 2.0)) * 0.45;
    vec3 accent = uAccent;
    vec3 target = mix(base, band, 0.82 * lit + pulse);
    if (pulse > 0.02) target = mix(target, accent, pulse * 0.65);
    return target;
  }
`;

export function patchBuildingMaterialForRipple(
  material: THREE.MeshStandardMaterial,
  uniforms: RippleShaderUniforms,
): void {
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior?.call(material, shader, renderer);
    shader.uniforms.uRippleTime = uniforms.uRippleTime;
    shader.uniforms.uMaxMin = uniforms.uMaxMin;
    shader.uniforms.uBand0 = uniforms.uBand0;
    shader.uniforms.uBand1 = uniforms.uBand1;
    shader.uniforms.uBand2 = uniforms.uBand2;
    shader.uniforms.uAccent = uniforms.uAccent;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\nattribute float aRippleArrival;\nvarying float vRippleArrival;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvRippleArrival = aRippleArrival;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${RIPPLE_BUILDING_PARS.replace("attribute float aRippleArrival;", "")}\nvarying float vRippleArrival;\n${RIPPLE_BUILDING_COLOR}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>\ndiffuseColor.rgb = applyRippleBuilding(diffuseColor.rgb, vRippleArrival);`,
    );
  };
  material.customProgramCacheKey = () => "walk-ripple-building";
  material.needsUpdate = true;
}

const LINE_VERTEX = `
  attribute float aRippleArrival;
  uniform float uRippleTime;
  uniform vec3 uAccent;
  varying float vMix;
  void main() {
    vMix = 0.0;
    if (uRippleTime >= 0.0 && uRippleTime >= aRippleArrival - 0.08) {
      float pulse = exp(-pow((uRippleTime - aRippleArrival) * 10.0, 2.0));
      vMix = clamp(pulse + (uRippleTime >= aRippleArrival ? 0.35 : 0.0), 0.0, 1.0);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAGMENT = `
  uniform vec3 uAccent;
  varying float vMix;
  void main() {
    if (vMix < 0.02) discard;
    gl_FragColor = vec4(uAccent, vMix);
  }
`;

export function createRippleNetworkLineMaterial(uniforms: RippleShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRippleTime: uniforms.uRippleTime,
      uAccent: uniforms.uAccent,
    },
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
