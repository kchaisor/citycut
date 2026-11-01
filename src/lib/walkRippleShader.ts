import * as THREE from "three";
import { getColour } from "./colours";
import { WALK_RIPPLE_TIMELINE_MAX_MIN } from "./walkRippleNetwork";

export type RippleShaderUniforms = {
  uRippleTime: { value: number };
  uBand0: { value: THREE.Color };
  uBand1: { value: THREE.Color };
  uBand2: { value: THREE.Color };
  uAccent: { value: THREE.Color };
  uOrigin0: { value: THREE.Color };
  uOrigin1: { value: THREE.Color };
  uOrigin2: { value: THREE.Color };
  uRivalCount: { value: number };
  uMaxMin: { value: number };
};

export function rippleColourUniforms(): RippleShaderUniforms {
  return {
    uRippleTime: { value: -1 },
    uBand0: { value: new THREE.Color(getColour("--walk-ripple-band-0")) },
    uBand1: { value: new THREE.Color(getColour("--walk-ripple-band-1")) },
    uBand2: { value: new THREE.Color(getColour("--walk-ripple-band-2")) },
    uAccent: { value: new THREE.Color(getColour("--walk-ripple-accent")) },
    uOrigin0: { value: new THREE.Color(getColour("--walk-ripple-origin-0")) },
    uOrigin1: { value: new THREE.Color(getColour("--walk-ripple-origin-1")) },
    uOrigin2: { value: new THREE.Color(getColour("--walk-ripple-origin-2")) },
    uRivalCount: { value: 0 },
    uMaxMin: { value: WALK_RIPPLE_TIMELINE_MAX_MIN },
  };
}

const RIPPLE_BUILDING_PARS = `
  attribute float aRippleArrival;
  attribute float aRippleOrigin;
  uniform float uRippleTime;
  uniform float uMaxMin;
  uniform float uRivalCount;
  uniform vec3 uBand0;
  uniform vec3 uBand1;
  uniform vec3 uBand2;
  uniform vec3 uAccent;
  uniform vec3 uOrigin0;
  uniform vec3 uOrigin1;
  uniform vec3 uOrigin2;
`;

const RIPPLE_BUILDING_COLOR = `
  vec3 rippleOriginColour(float originId) {
    if (originId < 0.5) return uOrigin0;
    if (originId < 1.5) return uOrigin1;
    return uOrigin2;
  }
  vec3 rippleBandColour(float arrival) {
    if (arrival <= 5.0) return uBand0;
    if (arrival <= 10.0) return uBand1;
    return uBand2;
  }
  vec3 applyRippleBuilding(vec3 base, float arrival, float originId) {
    if (uRippleTime < 0.0 || arrival > uMaxMin + 0.01 || arrival > 998.0) return base;
    if (uRippleTime < arrival - 0.04) return base;
    vec3 band = uRivalCount >= 1.5 ? rippleOriginColour(originId) : rippleBandColour(arrival);
    float lit = uRippleTime >= arrival ? 1.0 : 0.0;
    float pulse = exp(-pow((uRippleTime - arrival) * 7.0, 2.0)) * 0.55;
    vec3 accent = uRivalCount >= 1.5 ? rippleOriginColour(originId) : uAccent;
    float mixAmt = clamp(0.94 * lit + pulse, 0.0, 1.0);
    vec3 target = mix(base, band, mixAmt);
    if (pulse > 0.03) target = mix(target, accent, pulse * 0.5);
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
    shader.uniforms.uRivalCount = uniforms.uRivalCount;
    shader.uniforms.uBand0 = uniforms.uBand0;
    shader.uniforms.uBand1 = uniforms.uBand1;
    shader.uniforms.uBand2 = uniforms.uBand2;
    shader.uniforms.uAccent = uniforms.uAccent;
    shader.uniforms.uOrigin0 = uniforms.uOrigin0;
    shader.uniforms.uOrigin1 = uniforms.uOrigin1;
    shader.uniforms.uOrigin2 = uniforms.uOrigin2;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\nattribute float aRippleArrival;\nattribute float aRippleOrigin;\nvarying float vRippleArrival;\nvarying float vRippleOrigin;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvRippleArrival = aRippleArrival;\nvRippleOrigin = aRippleOrigin;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${RIPPLE_BUILDING_PARS.replace(/attribute float aRippleArrival;\nattribute float aRippleOrigin;\n/, "")}\nvarying float vRippleArrival;\nvarying float vRippleOrigin;\n${RIPPLE_BUILDING_COLOR}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>\ndiffuseColor.rgb = applyRippleBuilding(diffuseColor.rgb, vRippleArrival, vRippleOrigin);`,
    );
  };
  material.customProgramCacheKey = () => "walk-ripple-building-rival";
  material.needsUpdate = true;
}

const RIBBON_VERTEX = `
  attribute float aRippleArrival;
  attribute float aRippleOrigin;
  uniform float uRippleTime;
  varying float vMix;
  varying float vOrigin;
  void main() {
    vMix = 0.0;
    vOrigin = aRippleOrigin;
    if (uRippleTime >= 0.0) {
      float pulse = 0.0;
      if (uRippleTime >= aRippleArrival - 0.12) {
        pulse = exp(-pow((uRippleTime - aRippleArrival) * 6.5, 2.0));
      }
      float trail = uRippleTime >= aRippleArrival ? 0.88 : 0.0;
      vMix = clamp(max(pulse * 0.95, trail), 0.0, 1.0);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_FRAGMENT = `
  uniform float uRivalCount;
  uniform vec3 uAccent;
  uniform vec3 uOrigin0;
  uniform vec3 uOrigin1;
  uniform vec3 uOrigin2;
  varying float vMix;
  varying float vOrigin;
  vec3 rippleOriginColour(float originId) {
    if (originId < 0.5) return uOrigin0;
    if (originId < 1.5) return uOrigin1;
    return uOrigin2;
  }
  void main() {
    if (vMix < 0.04) discard;
    vec3 colour = uRivalCount >= 1.5 ? rippleOriginColour(vOrigin) : uAccent;
    gl_FragColor = vec4(colour, vMix);
  }
`;

export function createRippleNetworkRibbonMaterial(uniforms: RippleShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRippleTime: uniforms.uRippleTime,
      uAccent: uniforms.uAccent,
      uRivalCount: uniforms.uRivalCount,
      uOrigin0: uniforms.uOrigin0,
      uOrigin1: uniforms.uOrigin1,
      uOrigin2: uniforms.uOrigin2,
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}
