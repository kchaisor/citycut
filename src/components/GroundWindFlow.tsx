import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityModel } from "../types";
import { getColour } from "../lib/colours";
import {
  createGroundWindFieldBuilder,
  groundWindBaseVector,
  groundWindHeightAt,
  type GroundWindField,
  type GroundWindFieldBuilder,
} from "../lib/groundWindField";
import {
  createGroundWindParticles,
  GROUND_WIND_PARTICLES_MAX,
  GROUND_WIND_POINT_STRIDE,
  GROUND_WIND_POINTS_PER_PARTICLE,
  groundWindMetresPerSecond,
  groundWindPointsLength,
  stepGroundWindParticles,
  warmGroundWindParticles,
  type GroundWindParticles,
} from "../lib/groundWindParticles";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import { useColourRevision } from "../lib/useColourRevision";
import type { WindPeriodStats } from "../lib/windRose";

const FIELD_BUDGET_MS = 5;
const WARM_LIVE_S = 0.9;
const WARM_FROZEN_S = 2.4;
const MAX_FRAME_DT = 0.05;

const VERTEX_SHADER = `
attribute vec3 p0;
attribute vec3 p1;
attribute float a0;
attribute float a1;
attribute float along0;
attribute float along1;
uniform float widthM;
varying float vAlpha;
varying float vSide;
void main() {
  float end = position.y;
  float side = position.x;
  vec3 d = p1 - p0;
  float len = length(d.xz);
  vec2 perp = len > 1e-4 ? vec2(-d.z, d.x) / len : vec2(0.0);
  float along = mix(along0, along1, end);
  float w = widthM * mix(0.3, 1.0, along) * step(1e-4, len);
  vec3 centre = mix(p0, p1, end);
  vec3 worldPos = centre + vec3(perp.x, 0.0, perp.y) * side * w;
  vAlpha = mix(a0, a1, end);
  vSide = abs(side);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform vec3 edgeColour;
uniform vec3 coreColour;
uniform float opacity;
varying float vAlpha;
varying float vSide;
void main() {
  float core = 1.0 - vSide * vSide;
  vec3 colour = mix(edgeColour, coreColour, core * 0.6);
  float alpha = vAlpha * opacity * mix(1.0, 0.4, vSide);
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function reducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function qaFrozen(): boolean {
  return typeof window !== "undefined" && qaModeFromSearch(window.location.search);
}

function ribbonWidthM(sideM: number, cameraDistance: number): number {
  const base = Math.max(0.5, sideM * 0.0026);
  const lift = Math.min(3, Math.max(1, cameraDistance / (sideM * 0.45)));
  return base * lift;
}

function createRibbonGeometry(points: Float32Array): { geometry: THREE.InstancedBufferGeometry; data: THREE.InstancedInterleavedBuffer } {
  const geometry = new THREE.InstancedBufferGeometry();
  const corners = new Float32Array([-1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 1, 0, 0, 1, 0, 1, 1, 0]);
  geometry.setAttribute("position", new THREE.BufferAttribute(corners, 3));
  geometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
  const data = new THREE.InstancedInterleavedBuffer(points, GROUND_WIND_POINT_STRIDE, 1);
  data.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("p0", new THREE.InterleavedBufferAttribute(data, 3, 0));
  geometry.setAttribute("a0", new THREE.InterleavedBufferAttribute(data, 1, 3));
  geometry.setAttribute("along0", new THREE.InterleavedBufferAttribute(data, 1, 4));
  geometry.setAttribute("p1", new THREE.InterleavedBufferAttribute(data, 3, GROUND_WIND_POINT_STRIDE));
  geometry.setAttribute("a1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 3));
  geometry.setAttribute("along1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 4));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Number.POSITIVE_INFINITY);
  return { geometry, data };
}

export function GroundWindFlow({
  model,
  stats,
  animate,
}: {
  model: CityModel;
  stats: WindPeriodStats | null;
  animate: boolean;
}) {
  const sector = stats?.prevailingSector;
  const base = useMemo(() => groundWindBaseVector(sector), [sector]);
  const metresPerSecond = groundWindMetresPerSecond(model.sideM, stats?.prevailingMedianKmh);
  const heightAt = useCallback((east: number, north: number) => groundWindHeightAt(model, east, north), [model]);
  const frozen = !animate || reducedMotionPreferred() || qaFrozen();
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  const points = useMemo(() => new Float32Array(groundWindPointsLength(GROUND_WIND_PARTICLES_MAX)), []);
  const { geometry, data } = useMemo(() => createRibbonGeometry(points), [points]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          widthM: { value: 1 },
          opacity: { value: 0.92 },
          edgeColour: { value: new THREE.Color() },
          coreColour: { value: new THREE.Color() },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  const colourRevision = useColourRevision();
  useEffect(() => {
    (material.uniforms.edgeColour!.value as THREE.Color).set(getColour("--ground-wind-flow"));
    (material.uniforms.coreColour!.value as THREE.Color).set(getColour("--ground-wind-core"));
  }, [material, colourRevision]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const builderRef = useRef<GroundWindFieldBuilder | null>(null);
  const fieldRef = useRef<GroundWindField | null>(null);
  const particlesRef = useRef<GroundWindParticles | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    builderRef.current = createGroundWindFieldBuilder(model, base);
    fieldRef.current = null;
    particlesRef.current = null;
    geometry.instanceCount = 0;
    invalidate();
  }, [model, base, geometry, invalidate]);

  useEffect(() => {
    if (!frozen) invalidate();
  }, [frozen, invalidate]);

  useFrame((_, delta) => {
    const builder = builderRef.current;
    if (!fieldRef.current && builder) {
      if (!builder.step(FIELD_BUDGET_MS)) {
        invalidate();
        return;
      }
      const field = builder.finish();
      fieldRef.current = field;
      builderRef.current = null;
      const particles = createGroundWindParticles(field, heightAt, 7, points);
      particlesRef.current = particles;
      geometry.instanceCount = particles.count * GROUND_WIND_POINTS_PER_PARTICLE - 1;
      warmGroundWindParticles(particles, field, heightAt, metresPerSecond, frozenRef.current ? WARM_FROZEN_S : WARM_LIVE_S);
      data.needsUpdate = true;
      invalidate();
      return;
    }
    const field = fieldRef.current;
    const particles = particlesRef.current;
    if (!field || !particles) return;
    material.uniforms.widthM!.value = ribbonWidthM(model.sideM, camera.position.length());
    if (frozenRef.current) return;
    stepGroundWindParticles(particles, field, heightAt, Math.min(delta, MAX_FRAME_DT), metresPerSecond);
    data.needsUpdate = true;
    invalidate();
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={878} />;
}
