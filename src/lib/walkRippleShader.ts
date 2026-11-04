import * as THREE from "three";
import { getColour } from "./colours";
import { WALK_RIPPLE_TIMELINE_MAX_MIN } from "./walkRippleNetwork";

export const WALK_RIPPLE_TRAIL_MIN = 1;
export const WALK_RIPPLE_TRAIL_MAX = 10;
export const WALK_RIPPLE_TRAIL_DEFAULT = 4;
export { WALK_RIPPLE_RIBBON_HALF_DEFAULT_M as WALK_RIPPLE_RIBBON_BASE_HALF_M } from "./walkRippleRibbon";

export type RippleShaderUniforms = {
  uRippleTime: { value: number };
  uTrailLengthMin: { value: number };
  uRibbonHalfWidth: { value: number };
  uBandMixStrength: { value: number };
  uCometHead: { value: THREE.Color };
  uCometCore: { value: THREE.Color };
  uCometTail: { value: THREE.Color };
  uCometEmber: { value: THREE.Color };
  uBand0: { value: THREE.Color };
  uBand1: { value: THREE.Color };
  uBand2: { value: THREE.Color };
  uAccent: { value: THREE.Color };
  uMaxMin: { value: number };
};

export function rippleColourUniforms(): RippleShaderUniforms {
  return {
    uRippleTime: { value: -1 },
    uTrailLengthMin: { value: WALK_RIPPLE_TRAIL_DEFAULT },
    uRibbonHalfWidth: { value: 5 },
    uBandMixStrength: { value: 1 },
    uCometHead: { value: new THREE.Color(getColour("--walk-ripple-comet-head")) },
    uCometCore: { value: new THREE.Color(getColour("--walk-ripple-comet-core")) },
    uCometTail: { value: new THREE.Color(getColour("--walk-ripple-comet-tail")) },
    uCometEmber: { value: new THREE.Color(getColour("--walk-ripple-comet-ember")) },
    uBand0: { value: new THREE.Color(getColour("--walk-ripple-band-0")) },
    uBand1: { value: new THREE.Color(getColour("--walk-ripple-band-1")) },
    uBand2: { value: new THREE.Color(getColour("--walk-ripple-band-2")) },
    uAccent: { value: new THREE.Color(getColour("--walk-ripple-accent")) },
    uMaxMin: { value: WALK_RIPPLE_TIMELINE_MAX_MIN },
  };
}

const RIPPLE_BUILDING_PARS = `
  attribute float aRippleArrival;
  uniform float uRippleTime;
  uniform float uMaxMin;
  uniform float uBandMixStrength;
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
    if (uRippleTime < 0.0 || arrival > uMaxMin + 0.01 || arrival > 998.0) return base;
    if (uRippleTime < arrival - 0.04) return base;
    vec3 band = rippleBandColour(arrival);
    float bandLum = dot(band, vec3(0.299, 0.587, 0.114));
    vec3 softened = mix(vec3(bandLum), band, uBandMixStrength);
    float lit = uRippleTime >= arrival ? 1.0 : 0.0;
    float pulse = exp(-pow((uRippleTime - arrival) * 7.0, 2.0)) * 0.55 * uBandMixStrength;
    vec3 accent = uAccent;
    float mixAmt = clamp((0.94 * lit + pulse) * uBandMixStrength, 0.0, 1.0);
    vec3 target = mix(base, softened, mixAmt);
    if (pulse > 0.03) target = mix(target, accent, pulse * 0.42);
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
    shader.uniforms.uBandMixStrength = uniforms.uBandMixStrength;
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
  material.customProgramCacheKey = () => "walk-ripple-building-v2";
  material.needsUpdate = true;
}

const RIBBON_VERTEX = `
  attribute float aRippleArrival;
  attribute vec3 aRibbonCenter;
  attribute vec3 aRibbonOffset;
  uniform float uRippleTime;
  varying float vWalkMin;
  void main() {
    vWalkMin = aRippleArrival;
    float age = uRippleTime - aRippleArrival;
    float headScale = (age >= 0.0 && age <= 0.8) ? 1.6 : 1.0;
    vec3 pos = aRibbonCenter + aRibbonOffset * headScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const RIBBON_FRAGMENT = `
  uniform float uRippleTime;
  uniform vec3 uCometHead;
  uniform vec3 uCometCore;
  uniform vec3 uBand0;
  uniform vec3 uBand1;
  uniform vec3 uBand2;
  varying float vWalkMin;

  vec3 rippleBandColour(float arrival) {
    if (arrival <= 5.0) return uBand0;
    if (arrival <= 10.0) return uBand1;
    return uBand2;
  }

  void main() {
    if (uRippleTime < 0.0) discard;
    float age = uRippleTime - vWalkMin;
    if (age < 0.0) discard;

    const float alphaFloor = 0.75;
    const float tailFadeMin = 3.0;
    const float headMin = 0.8;

    vec3 rgb = rippleBandColour(vWalkMin);
    float alpha = alphaFloor;
    if (age <= tailFadeMin) {
      alpha = mix(1.0, alphaFloor, age / tailFadeMin);
    }
    if (age <= headMin) {
      alpha = 1.0;
      rgb = mix(rgb, uCometHead, 0.72);
      rgb = mix(rgb, uCometCore, 0.55);
    }
    gl_FragColor = vec4(rgb, alpha);
  }
`;

export function createRippleNetworkRibbonMaterial(uniforms: RippleShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRippleTime: uniforms.uRippleTime,
      uCometHead: uniforms.uCometHead,
      uCometCore: uniforms.uCometCore,
      uBand0: uniforms.uBand0,
      uBand1: uniforms.uBand1,
      uBand2: uniforms.uBand2,
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });
}

export function refreshRippleCometColours(uniforms: RippleShaderUniforms): void {
  uniforms.uCometHead.value.setStyle(getColour("--walk-ripple-comet-head"));
  uniforms.uCometCore.value.setStyle(getColour("--walk-ripple-comet-core"));
  uniforms.uCometTail.value.setStyle(getColour("--walk-ripple-comet-tail"));
  uniforms.uCometEmber.value.setStyle(getColour("--walk-ripple-comet-ember"));
}

