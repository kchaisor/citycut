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
  GROUND_WIND_TRAIL_HEAD_WIDTH_PX,
  GROUND_WIND_TRAIL_TAIL_WIDTH_PX,
  groundWindMetresPerSecond,
  groundWindPointsLength,
  scatterGroundWindScreen,
  stepGroundWindParticles,
  warmGroundWindParticles,
  type GroundWindParticles,
} from "../lib/groundWindParticles";
import { useColourRevision } from "../lib/useColourRevision";
import type { WindPeriodStats } from "../lib/windRose";

const FIELD_BUDGET_MS = 5;
const WARM_LIVE_S = 1.4;
const WARM_FROZEN_S = 2.4;
const MAX_FRAME_DT = 0.05;

const VERTEX_SHADER = `
attribute vec3 p0;
attribute vec3 p1;
attribute float a0;
attribute float a1;
attribute float along0;
attribute float along1;
attribute float fast0;
attribute float fast1;
uniform float metresPerPx;
varying float vAlpha;
varying float vSide;
varying float vAlong;
varying float vFast;
void main() {
  float end = position.y;
  float side = position.x;
  vec3 d = p1 - p0;
  float len = length(d.xz);
  vec2 perp = len > 1e-4 ? vec2(-d.z, d.x) / len : vec2(0.0);
  float along = mix(along0, along1, end);
  float fast = mix(fast0, fast1, end);
  float wPx = mix(${GROUND_WIND_TRAIL_TAIL_WIDTH_PX.toFixed(2)}, ${GROUND_WIND_TRAIL_HEAD_WIDTH_PX.toFixed(2)}, along);
  float w = metresPerPx * wPx * step(1e-4, len);
  vec3 centre = mix(p0, p1, end);
  vec3 worldPos = centre + vec3(perp.x, 0.0, perp.y) * side * w;
  vAlpha = mix(a0, a1, end);
  vSide = abs(side);
  vAlong = along;
  vFast = fast;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform vec3 headColour;
uniform vec3 fastColour;
uniform float opacity;
varying float vAlpha;
varying float vSide;
varying float vAlong;
varying float vFast;
void main() {
  vec3 colour = mix(headColour, fastColour, clamp(vFast, 0.0, 1.0));
  float edge = 1.0 - smoothstep(0.72, 1.0, vSide);
  float alpha = vAlpha * opacity * edge;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function reducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function metresPerPixel(camera: THREE.Camera, point: THREE.Vector3, heightPx: number): number {
  if (camera instanceof THREE.OrthographicCamera) {
    const span = (camera.top - camera.bottom) / Math.max(1, camera.zoom);
    return span / heightPx;
  }
  const persp = camera as THREE.PerspectiveCamera;
  const dist = Math.max(0.1, camera.position.distanceTo(point));
  const worldHeight = 2 * Math.tan((persp.fov * Math.PI) / 360) * dist;
  return worldHeight / heightPx;
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
  geometry.setAttribute("fast0", new THREE.InterleavedBufferAttribute(data, 1, 5));
  geometry.setAttribute("p1", new THREE.InterleavedBufferAttribute(data, 3, GROUND_WIND_POINT_STRIDE));
  geometry.setAttribute("a1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 3));
  geometry.setAttribute("along1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 4));
  geometry.setAttribute("fast1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 5));
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
  const frozen = !animate || reducedMotionPreferred();
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
          metresPerPx: { value: 0.01 },
          opacity: { value: 1 },
          headColour: { value: new THREE.Color() },
          fastColour: { value: new THREE.Color() },
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
    (material.uniforms.headColour!.value as THREE.Color).set(getColour("--ground-wind-core"));
    (material.uniforms.fastColour!.value as THREE.Color).set(getColour("--ground-wind-flow"));
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
  const screenSeededRef = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const projScratch = useMemo(() => new THREE.Vector3(), []);

  const screenProject = useCallback(
    (east: number, north: number, y: number) => {
      projScratch.set(east, y, -north);
      projScratch.project(camera);
      if (projScratch.z > 1) return null;
      return {
        x: ((projScratch.x + 1) / 2) * size.width,
        y: ((1 - projScratch.y) / 2) * size.height,
      };
    },
    [camera, size.width, size.height, projScratch],
  );

  useEffect(() => {
    builderRef.current = createGroundWindFieldBuilder(model, base);
    fieldRef.current = null;
    particlesRef.current = null;
    screenSeededRef.current = false;
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
      particles.screenProject = screenProject;
      particlesRef.current = particles;
      geometry.instanceCount = particles.count * GROUND_WIND_POINTS_PER_PARTICLE - 1;
      warmGroundWindParticles(particles, field, heightAt, metresPerSecond, frozenRef.current ? WARM_FROZEN_S : WARM_LIVE_S);
      scatterGroundWindScreen(particles, field, heightAt);
      screenSeededRef.current = true;
      data.needsUpdate = true;
      invalidate();
      return;
    }
    const field = fieldRef.current;
    const particles = particlesRef.current;
    if (!field || !particles) return;
    particles.screenProject = screenProject;
    const headEast = particles.east[0] ?? 0;
    const headNorth = particles.north[0] ?? 0;
    const headY = heightAt(headEast, headNorth);
    projScratch.set(headEast, headY, -headNorth);
    material.uniforms.metresPerPx!.value = metresPerPixel(camera, projScratch, size.height);
    if (frozenRef.current) return;
    stepGroundWindParticles(particles, field, heightAt, Math.min(delta, MAX_FRAME_DT), metresPerSecond);
    if (!screenSeededRef.current) {
      scatterGroundWindScreen(particles, field, heightAt);
      screenSeededRef.current = true;
    }
    data.needsUpdate = true;
    invalidate();
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={878} />;
}
