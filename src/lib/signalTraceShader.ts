import * as THREE from "three";
import { getColour } from "./colours";
import { SIGNAL_TRACE_WALK_SPEED_MPS } from "./signalTraceHeadway";

export type SignalTraceUniforms = {
  uSignalTime: { value: number };
  uWalkSpeed: { value: number };
  uStreetDim: { value: THREE.Color };
  uStreetPulse: { value: THREE.Color };
  uRailPulse: { value: THREE.Color };
  uRippleTime: { value: number };
  uRippleMax: { value: number };
  uRippleAccent: { value: THREE.Color };
};

export function signalTraceUniforms(): SignalTraceUniforms {
  return {
    uSignalTime: { value: 0 },
    uWalkSpeed: { value: SIGNAL_TRACE_WALK_SPEED_MPS },
    uStreetDim: { value: new THREE.Color(getColour("--signal-trace-street-dim")) },
    uStreetPulse: { value: new THREE.Color(getColour("--signal-trace-street-pulse")) },
    uRailPulse: { value: new THREE.Color(getColour("--signal-trace-rail-pulse")) },
    uRippleTime: { value: -1 },
    uRippleMax: { value: 20 },
    uRippleAccent: { value: new THREE.Color(getColour("--signal-trace-afterglow")) },
  };
}

const TRACE_VERTEX = `
  attribute float aPathDist;
  attribute float aPulseRate;
  attribute float aRippleArrival;
  uniform float uSignalTime;
  uniform float uWalkSpeed;
  uniform float uRippleTime;
  varying float vPathDist;
  varying float vPulseRate;
  varying float vRippleMix;
  void main() {
    vPathDist = aPathDist;
    vPulseRate = aPulseRate;
    vRippleMix = 0.0;
    if (uRippleTime >= 0.0 && aRippleArrival <= 998.0) {
      float trail = uRippleTime >= aRippleArrival ? 0.75 : 0.0;
      float pulse = exp(-pow((uRippleTime - aRippleArrival) * 6.0, 2.0));
      vRippleMix = clamp(max(trail, pulse * 0.9), 0.0, 1.0);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACE_STREET_FRAGMENT = `
  uniform float uSignalTime;
  uniform float uWalkSpeed;
  uniform vec3 uStreetDim;
  uniform vec3 uStreetPulse;
  uniform vec3 uRippleAccent;
  varying float vPathDist;
  varying float vPulseRate;
  varying float vRippleMix;
  void main() {
    float wave = sin((vPathDist - uSignalTime * uWalkSpeed) * vPulseRate * 6.28318);
    float dash = smoothstep(-0.15, 0.35, wave);
    vec3 base = mix(uStreetDim, uStreetPulse, dash * 0.85);
    vec3 colour = mix(base, uRippleAccent, vRippleMix * 0.92);
    float alpha = clamp(0.22 + dash * 0.78 + vRippleMix * 0.35, 0.0, 1.0);
    if (alpha < 0.04) discard;
    gl_FragColor = vec4(colour, alpha);
  }
`;

const TRACE_RAIL_FRAGMENT = `
  uniform float uSignalTime;
  uniform float uWalkSpeed;
  uniform vec3 uStreetDim;
  uniform vec3 uRailPulse;
  uniform vec3 uRippleAccent;
  varying float vPathDist;
  varying float vPulseRate;
  varying float vRippleMix;
  void main() {
    float spacing = max(12.0, 6.28318 / max(vPulseRate, 0.02));
    float phase = fract((vPathDist - uSignalTime * uWalkSpeed * 1.35) / spacing);
    float dash = smoothstep(0.35, 0.5, phase) * (1.0 - smoothstep(0.62, 0.78, phase));
    vec3 base = mix(uStreetDim, uRailPulse, dash);
    vec3 colour = mix(base, uRippleAccent, vRippleMix * 0.5);
    float alpha = clamp(0.35 + dash * 0.65 + vRippleMix * 0.2, 0.0, 1.0);
    if (alpha < 0.05) discard;
    gl_FragColor = vec4(colour, alpha);
  }
`;

export function createStreetTraceMaterial(uniforms: SignalTraceUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSignalTime: uniforms.uSignalTime,
      uWalkSpeed: uniforms.uWalkSpeed,
      uStreetDim: uniforms.uStreetDim,
      uStreetPulse: uniforms.uStreetPulse,
      uRippleAccent: uniforms.uRippleAccent,
      uRippleTime: uniforms.uRippleTime,
    },
    vertexShader: TRACE_VERTEX,
    fragmentShader: TRACE_STREET_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

export function createRailTraceMaterial(uniforms: SignalTraceUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSignalTime: uniforms.uSignalTime,
      uWalkSpeed: uniforms.uWalkSpeed,
      uStreetDim: uniforms.uStreetDim,
      uRailPulse: uniforms.uRailPulse,
      uRippleAccent: uniforms.uRippleAccent,
      uRippleTime: uniforms.uRippleTime,
    },
    vertexShader: TRACE_VERTEX,
    fragmentShader: TRACE_RAIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

const BUILDING_PARS = `
  attribute float aSourceGlow;
  uniform vec3 uGlassFill;
  uniform vec3 uGlassEdge;
  uniform vec3 uSourceFill;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying float vSourceGlow;
`;

const BUILDING_COLOR = `
  vec3 signalTraceBuilding(vec3 base) {
    vec3 n = normalize(vViewNormal);
    vec3 v = normalize(-vViewPos);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    vec3 glass = mix(uGlassFill, uGlassEdge, fresnel * 0.95);
    glass = mix(glass, uSourceFill, vSourceGlow * 0.82);
    return glass;
  }
`;

export type SignalTraceBuildingUniforms = {
  uGlassFill: { value: THREE.Color };
  uGlassEdge: { value: THREE.Color };
  uSourceFill: { value: THREE.Color };
};

export function signalTraceBuildingUniforms(): SignalTraceBuildingUniforms {
  return {
    uGlassFill: { value: new THREE.Color(getColour("--signal-trace-building-fill")) },
    uGlassEdge: { value: new THREE.Color(getColour("--signal-trace-building-rim")) },
    uSourceFill: { value: new THREE.Color(getColour("--signal-trace-source-glow")) },
  };
}

export function patchBuildingMaterialForSignalTrace(
  material: THREE.MeshStandardMaterial,
  uniforms: SignalTraceBuildingUniforms,
): void {
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior?.call(material, shader, renderer);
    shader.uniforms.uGlassFill = uniforms.uGlassFill;
    shader.uniforms.uGlassEdge = uniforms.uGlassEdge;
    shader.uniforms.uSourceFill = uniforms.uSourceFill;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\nattribute float aSourceGlow;\nvarying float vSourceGlow;\nvarying vec3 vViewNormal;\nvarying vec3 vViewPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>\nvViewNormal = normalMatrix * objectNormal;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvSourceGlow = aSourceGlow;\nvec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);\nvViewPos = mvPos.xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${BUILDING_PARS}\n${BUILDING_COLOR}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>\ndiffuseColor.rgb = signalTraceBuilding(diffuseColor.rgb);`,
    );
  };
  material.customProgramCacheKey = () => "signal-trace-building";
  material.metalness = 0.65;
  material.roughness = 0.22;
  material.transparent = true;
  material.opacity = 0.92;
  material.needsUpdate = true;
}
