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
  GROUND_WIND_CASING_WIDTH_PX,
  GROUND_WIND_PARTICLES_MAX,
  GROUND_WIND_POINT_STRIDE,
  GROUND_WIND_POINTS_PER_PARTICLE,
  groundWindMetresPerSecond,
  groundWindPointsLength,
  groundWindTargetParticleCount,
  stepGroundWindParticles,
  warmGroundWindParticles,
  type GroundWindParticles,
} from "../lib/groundWindParticles";
import { useColourRevision } from "../lib/useColourRevision";
import type { WindPeriodStats } from "../lib/windRose";

const FIELD_BUDGET_MS = 5;
const WARM_LIVE_S = 2.6;
const WARM_FROZEN_S = 2.4;
const MAX_FRAME_DT = 0.05;

const VERTEX_SHADER = `
attribute vec3 p0;
attribute vec3 p1;
attribute float a0;
attribute float a1;
attribute float along0;
attribute float along1;
attribute float band0;
attribute float band1;
attribute float corePx0;
attribute float corePx1;
uniform float metresPerPx;
uniform float passRole;
varying float vAlpha;
varying float vSide;
varying float vAlong;
varying float vBand;
void main() {
  float end = position.y;
  float side = position.x;
  vec3 d = p1 - p0;
  float len = length(d.xz);
  vec2 perp = len > 1e-4 ? vec2(-d.z, d.x) / len : vec2(0.0);
  float along = mix(along0, along1, end);
  float corePx = mix(corePx0, corePx1, end);
  float wPx = passRole < 0.5
    ? mix(0.65, ${GROUND_WIND_CASING_WIDTH_PX.toFixed(2)}, along)
    : mix(0.35, corePx, along);
  float w = metresPerPx * wPx * step(1e-4, len);
  vec3 centre = mix(p0, p1, end);
  vec3 worldPos = centre + vec3(perp.x, 0.0, perp.y) * side * w;
  vAlpha = mix(a0, a1, end);
  vSide = abs(side);
  vAlong = along;
  vBand = mix(band0, band1, end);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform vec3 coreColour;
uniform vec3 fastColour;
uniform float passRole;
uniform float opacity;
varying float vAlpha;
varying float vSide;
varying float vAlong;
varying float vBand;
void main() {
  float edge = 1.0 - smoothstep(0.72, 1.0, vSide);
  float alpha = vAlpha * opacity * edge;
  if (alpha < 0.004) discard;
  if (passRole < 0.5) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * 0.9);
  } else {
    vec3 colour = vBand > 1.5 ? fastColour : coreColour;
    gl_FragColor = vec4(colour, alpha);
  }
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
  geometry.setAttribute("band0", new THREE.InterleavedBufferAttribute(data, 1, 5));
  geometry.setAttribute("corePx0", new THREE.InterleavedBufferAttribute(data, 1, 6));
  geometry.setAttribute("p1", new THREE.InterleavedBufferAttribute(data, 3, GROUND_WIND_POINT_STRIDE));
  geometry.setAttribute("a1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 3));
  geometry.setAttribute("along1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 4));
  geometry.setAttribute("band1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 5));
  geometry.setAttribute("corePx1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 6));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Number.POSITIVE_INFINITY);
  return { geometry, data };
}

function makeWindMaterial(passRole: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      metresPerPx: { value: 0.01 },
      passRole: { value: passRole },
      opacity: { value: 1 },
      coreColour: { value: new THREE.Color() },
      fastColour: { value: new THREE.Color() },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
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
  const medianKmh = stats?.prevailingMedianKmh && stats.prevailingMedianKmh > 0 ? stats.prevailingMedianKmh : 18;
  const metresPerSecond = groundWindMetresPerSecond(model.sideM, stats?.prevailingMedianKmh);
  const heightAt = useCallback((east: number, north: number) => groundWindHeightAt(model, east, north), [model]);
  const frozen = !animate || reducedMotionPreferred();
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  const points = useMemo(() => new Float32Array(groundWindPointsLength(GROUND_WIND_PARTICLES_MAX)), []);
  const { geometry, data } = useMemo(() => createRibbonGeometry(points), [points]);
  const casingMaterial = useMemo(() => makeWindMaterial(0), []);
  const coreMaterial = useMemo(() => makeWindMaterial(1), []);

  const colourRevision = useColourRevision();
  useEffect(() => {
    (casingMaterial.uniforms.coreColour!.value as THREE.Color).set(getColour("--ground-wind-core"));
    (casingMaterial.uniforms.fastColour!.value as THREE.Color).set(getColour("--ground-wind-flow"));
    (coreMaterial.uniforms.coreColour!.value as THREE.Color).set(getColour("--ground-wind-core"));
    (coreMaterial.uniforms.fastColour!.value as THREE.Color).set(getColour("--ground-wind-flow"));
  }, [casingMaterial, coreMaterial, colourRevision]);

  useEffect(
    () => () => {
      geometry.dispose();
      casingMaterial.dispose();
      coreMaterial.dispose();
    },
    [geometry, casingMaterial, coreMaterial],
  );

  const builderRef = useRef<GroundWindFieldBuilder | null>(null);
  const fieldRef = useRef<GroundWindField | null>(null);
  const particlesRef = useRef<GroundWindParticles | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const projScratch = useMemo(() => new THREE.Vector3(), []);
  const hitScratch = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

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

  const screenUnproject = useCallback(
    (screenX: number, screenY: number) => {
      const x = (screenX / size.width) * 2 - 1;
      const y = -(screenY / size.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const planeY = heightAt(0, 0);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      if (!raycaster.ray.intersectPlane(plane, hitScratch)) return null;
      let east = hitScratch.x;
      let north = -hitScratch.z;
      const yGround = heightAt(east, north);
      raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -yGround), hitScratch);
      east = hitScratch.x;
      north = -hitScratch.z;
      const half = model.sideM / 2;
      if (east < -half || east > half || north < -half || north > half) return null;
      return { east, north };
    },
    [camera, heightAt, hitScratch, model.sideM, raycaster, size.height, size.width],
  );

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
      const targetCount = groundWindTargetParticleCount(size.width, size.height);
      const particles = createGroundWindParticles(field, heightAt, 7, points, targetCount, model);
      particles.screenProject = screenProject;
      particles.screenUnproject = screenUnproject;
      particles.viewWidth = size.width;
      particles.viewHeight = size.height;
      particles.medianKmh = medianKmh;
      particles.cityModel = model;
      particlesRef.current = particles;
      geometry.instanceCount = particles.count * GROUND_WIND_POINTS_PER_PARTICLE - 1;
      particles.metresPerPx = metresPerPixel(camera, projScratch.set(0, heightAt(0, 0), 0), size.height);
      warmGroundWindParticles(particles, field, heightAt, metresPerSecond, frozenRef.current ? WARM_FROZEN_S : WARM_LIVE_S);
      data.needsUpdate = true;
      invalidate();
      return;
    }
    const field = fieldRef.current;
    const particles = particlesRef.current;
    if (!field || !particles) return;
    particles.screenProject = screenProject;
    particles.screenUnproject = screenUnproject;
    particles.viewWidth = size.width;
    particles.viewHeight = size.height;
    particles.medianKmh = medianKmh;
    const headEast = particles.east[0] ?? 0;
    const headNorth = particles.north[0] ?? 0;
    const headY = heightAt(headEast, headNorth);
    projScratch.set(headEast, headY, -headNorth);
    const metresPerPx = metresPerPixel(camera, projScratch, size.height);
    particles.metresPerPx = metresPerPx;
    casingMaterial.uniforms.metresPerPx!.value = metresPerPx;
    coreMaterial.uniforms.metresPerPx!.value = metresPerPx;
    if (frozenRef.current) return;
    stepGroundWindParticles(particles, field, heightAt, Math.min(delta, MAX_FRAME_DT), metresPerSecond);
    data.needsUpdate = true;
    invalidate();
  });

  return (
    <>
      <mesh geometry={geometry} material={casingMaterial} frustumCulled={false} renderOrder={877} />
      <mesh geometry={geometry} material={coreMaterial} frustumCulled={false} renderOrder={878} />
    </>
  );
}
