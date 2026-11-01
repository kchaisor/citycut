import * as THREE from "three";
import { getColour } from "./colours";
import { WALK_RIPPLE_TIMELINE_MAX_MIN } from "./walkRippleNetwork";

export const WALK_RIPPLE_TRAIL_MIN = 1;
export const WALK_RIPPLE_TRAIL_MAX = 10;
export const WALK_RIPPLE_TRAIL_DEFAULT = 4;

export type RippleShaderUniforms = {
  uRippleTime: { value: number };
  uTrailLengthMin: { value: number };
  uCometHead: { value: THREE.Color };
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
    uCometHead: { value: new THREE.Color(getColour("--walk-ripple-comet-head")) },
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
    float lit = uRippleTime >= arrival ? 1.0 : 0.0;
    float pulse = exp(-pow((uRippleTime - arrival) * 7.0, 2.0)) * 0.55;
    vec3 accent = uAccent;
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

const RIBBON_VERTEX = `
  attribute float aRippleArrival;
  varying float vWalkMin;
  void main() {
    vWalkMin = aRippleArrival;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_FRAGMENT = `
  uniform float uRippleTime;
  uniform float uTrailLengthMin;
  uniform vec3 uCometHead;
  uniform vec3 uCometTail;
  uniform vec3 uCometEmber;
  varying float vWalkMin;

  void main() {
    if (uRippleTime < 0.0) discard;
    float age = uRippleTime - vWalkMin;
    if (age < -0.18) discard;

    float head = exp(-pow(age * 11.5, 2.0));
    float trailLen = max(uTrailLengthMin, 0.05);
    vec3 rgb;
    float alpha;

    if (age < 0.0) {
      rgb = uCometHead;
      alpha = head * 0.42;
    } else if (age <= trailLen) {
      float u = age / trailLen;
      float cool = pow(u, 0.82);
      rgb = mix(uCometHead, uCometTail, cool);
      rgb = mix(rgb, uCometEmber, smoothstep(0.72, 1.0, u) * 0.35);
      rgb = mix(rgb, uCometHead, head * 0.92);
      float tailAlpha = mix(0.88, 0.38, cool);
      alpha = max(tailAlpha, head * 0.96);
    } else {
      float emberFade = exp(-(age - trailLen) * 0.55);
      rgb = uCometEmber;
      alpha = 0.26 * emberFade;
    }

    alpha = clamp(alpha, 0.0, 1.0);
    if (alpha < 0.035) discard;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

export function createRippleNetworkRibbonMaterial(uniforms: RippleShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRippleTime: uniforms.uRippleTime,
      uTrailLengthMin: uniforms.uTrailLengthMin,
      uCometHead: uniforms.uCometHead,
      uCometTail: uniforms.uCometTail,
      uCometEmber: uniforms.uCometEmber,
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

export function refreshRippleCometColours(uniforms: RippleShaderUniforms): void {
  uniforms.uCometHead.value.setStyle(getColour("--walk-ripple-comet-head"));
  uniforms.uCometTail.value.setStyle(getColour("--walk-ripple-comet-tail"));
  uniforms.uCometEmber.value.setStyle(getColour("--walk-ripple-comet-ember"));
}
