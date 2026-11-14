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
  GROUND_WIND_CORE_WIDTH_PX,
  GROUND_WIND_PARTICLES_MAX,
  GROUND_WIND_POINTS_PER_PARTICLE,
  GROUND_WIND_POINT_STRIDE,
  groundWindMetresPerSecond,
  groundWindPointsLength,
  layoutGroundWindScreenSeeds,
  stepGroundWindParticles,
  warmGroundWindParticles,
  type GroundWindParticles,
} from "../lib/groundWindParticles";
import {
  GROUND_WIND_GROUND_Y_MIN,
  GROUND_WIND_NEAR_Y_MAX,
} from "../lib/groundWindScreen";
import { useColourRevision } from "../lib/useColourRevision";
import { groundWindDebugEnabled, groundWindDebugSnapshot, groundWindRenderStats } from "../lib/groundWindDebug";
import { GROUND_WIND_EMPTY_MASK_RECT, groundWindHudMaskFromDom, type GroundWindMaskRect } from "../lib/groundWindHudMask";
import { SURFACE } from "../lib/surfaceLayers";
import type { WindPeriodStats } from "../lib/windRose";

const FIELD_BUDGET_MS = 5;
const WARM_LIVE_S = 2.6;
const WARM_FROZEN_S = 2.4;
const MAX_FRAME_DT = 0.05;
const HUD_MASK_POLL_MS = 500;

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
attribute float casing0;
attribute float casing1;
uniform vec2 resolution;
uniform float passRole;
uniform vec4 maskRight;
uniform vec4 maskBottom;
varying float vAlpha;
varying vec2 vScreenPx;
varying float vSide;
varying float vAlong;
varying float vBand;
varying float vCasing;
void main() {
  float end = position.y;
  float side = position.x;
  vec4 clip0 = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
  vec4 clip1 = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
  vec3 centre = mix(p0, p1, end);
  vec4 clipC = projectionMatrix * modelViewMatrix * vec4(centre, 1.0);
  vec2 ndc0 = clip0.xy / max(1e-5, clip0.w);
  vec2 ndc1 = clip1.xy / max(1e-5, clip1.w);
  vec2 dir = ndc1 - ndc0;
  float dirLen = length(dir);
  vec2 tangent = dirLen > 1e-5 ? dir / dirLen : vec2(1.0, 0.0);
  vec2 perp = vec2(-tangent.y, tangent.x);
  float along = mix(along0, along1, end);
  float wPx = passRole < 0.5 ? ${GROUND_WIND_CASING_WIDTH_PX.toFixed(2)} : ${GROUND_WIND_CORE_WIDTH_PX.toFixed(2)};
  vec2 pxOffset = perp * side * wPx;
  vec2 ndcOffset = vec2(pxOffset.x * 2.0 / resolution.x, pxOffset.y * 2.0 / resolution.y);
  vec2 ndc = clipC.xy / max(1e-5, clipC.w) + ndcOffset;
  vScreenPx = (ndc * 0.5 + 0.5) * resolution;
  vAlpha = mix(a0, a1, end);
  vSide = abs(side);
  vAlong = along;
  vBand = mix(band0, band1, end);
  vCasing = mix(casing0, casing1, end);
  gl_Position = vec4(ndc * clipC.w, clipC.zw);
}
`;

const FRAGMENT_SHADER = `
uniform vec2 resolution;
uniform vec3 coreColour;
uniform float passRole;
uniform float opacity;
varying float vAlpha;
varying vec2 vScreenPx;
varying float vSide;
varying float vAlong;
varying float vBand;
varying float vCasing;
uniform vec4 maskRight;
uniform vec4 maskBottom;
void main() {
  vec2 css = vec2(vScreenPx.x, resolution.y - vScreenPx.y);
  if (css.x >= maskRight.x && css.x <= maskRight.z && css.y >= maskRight.y && css.y <= maskRight.w) discard;
  if (css.x >= maskBottom.x && css.x <= maskBottom.z && css.y >= maskBottom.y && css.y <= maskBottom.w) discard;
  float edge = 1.0 - smoothstep(0.86, 1.0, vSide);
  float alpha = vAlpha * opacity * edge;
  if (alpha < 0.004) discard;
  if (passRole < 0.5) {
    if (vCasing < 0.5) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * 0.6);
  } else {
    gl_FragColor = vec4(coreColour, alpha);
  }
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

function groundWindMedianMetresPerPixel(
  camera: THREE.Camera,
  particles: GroundWindParticles,
  heightAt: (east: number, north: number) => number,
  heightPx: number,
  scratch: THREE.Vector3,
): number {
  scratch.set(0, heightAt(0, 0), 0);
  if (particles.count <= 0) return metresPerPixel(camera, scratch, heightPx);
  const distances: number[] = [];
  const stride = Math.max(1, Math.floor(particles.count / 220));
  for (let i = 0; i < particles.count; i += stride) {
    const sy = particles.screenY[i]!;
    if (sy < GROUND_WIND_GROUND_Y_MIN || sy > GROUND_WIND_NEAR_Y_MAX) continue;
    const east = particles.east[i]!;
    const north = particles.north[i]!;
    scratch.set(east, heightAt(east, north), -north);
    distances.push(Math.max(0.1, camera.position.distanceTo(scratch)));
  }
  if (distances.length === 0) {
    scratch.set(0, heightAt(0, 0), 0);
    return metresPerPixel(camera, scratch, heightPx);
  }
  distances.sort((a, b) => a - b);
  const mid = distances[Math.floor((distances.length - 1) / 2)]!;
  scratch.set(0, heightAt(0, 0), 0);
  const centreDist = Math.max(0.1, camera.position.distanceTo(scratch));
  const blendDist = mid * 0.72 + centreDist * 0.28;
  if (camera instanceof THREE.OrthographicCamera) {
    return metresPerPixel(camera, scratch, heightPx);
  }
  const persp = camera as THREE.PerspectiveCamera;
  const worldHeight = 2 * Math.tan((persp.fov * Math.PI) / 360) * blendDist;
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
  geometry.setAttribute("casing0", new THREE.InterleavedBufferAttribute(data, 1, 7));
  geometry.setAttribute("p1", new THREE.InterleavedBufferAttribute(data, 3, GROUND_WIND_POINT_STRIDE));
  geometry.setAttribute("a1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 3));
  geometry.setAttribute("along1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 4));
  geometry.setAttribute("band1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 5));
  geometry.setAttribute("corePx1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 6));
  geometry.setAttribute("casing1", new THREE.InterleavedBufferAttribute(data, 1, GROUND_WIND_POINT_STRIDE + 7));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Number.POSITIVE_INFINITY);
  return { geometry, data };
}

function makeWindMaterial(passRole: number, width: number, height: number) {
  const empty = GROUND_WIND_EMPTY_MASK_RECT;
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      resolution: { value: new THREE.Vector2(width, height) },
      passRole: { value: passRole },
      opacity: { value: 1 },
      coreColour: { value: new THREE.Color() },
      maskRight: { value: new THREE.Vector4(empty.x0, empty.y0, empty.x1, empty.y1) },
      maskBottom: { value: new THREE.Vector4(empty.x0, empty.y0, empty.x1, empty.y1) },
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
  const debugWind = groundWindDebugEnabled();
  const debugFrameRef = useRef(0);
  const cameraDigestRef = useRef("");
  const cameraSettleRef = useRef(0);
  const layoutDigestRef = useRef("");
  const layoutPendingRef = useRef(false);

  const points = useMemo(() => new Float32Array(groundWindPointsLength(GROUND_WIND_PARTICLES_MAX)), []);
  const { geometry, data } = useMemo(() => createRibbonGeometry(points), [points]);
  const size = useThree((state) => state.size);
  const casingMaterial = useMemo(() => makeWindMaterial(0, size.width, size.height), [size.height, size.width]);
  const coreMaterial = useMemo(() => makeWindMaterial(1, size.width, size.height), [size.height, size.width]);

  const colourRevision = useColourRevision();
  useEffect(() => {
    (casingMaterial.uniforms.coreColour!.value as THREE.Color).set(getColour("--ground-wind-core"));
    (coreMaterial.uniforms.coreColour!.value as THREE.Color).set(getColour("--ground-wind-core"));
  }, [casingMaterial, coreMaterial, colourRevision]);

  useEffect(() => {
    const res = casingMaterial.uniforms.resolution!.value as THREE.Vector2;
    res.set(size.width, size.height);
    (coreMaterial.uniforms.resolution!.value as THREE.Vector2).copy(res);
  }, [casingMaterial, coreMaterial, size.height, size.width]);

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
  const canvasElement = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const apply = (uniform: THREE.IUniform, rect: GroundWindMaskRect): boolean => {
      const v = uniform.value as THREE.Vector4;
      if (v.x === rect.x0 && v.y === rect.y0 && v.z === rect.x1 && v.w === rect.y1) return false;
      v.set(rect.x0, rect.y0, rect.x1, rect.y1);
      return true;
    };
    const sync = () => {
      const mask = groundWindHudMaskFromDom(canvasElement);
      let changed = false;
      for (const mat of [casingMaterial, coreMaterial]) {
        changed = apply(mat.uniforms.maskRight!, mask.right) || changed;
        changed = apply(mat.uniforms.maskBottom!, mask.bottom) || changed;
      }
      if (changed) invalidate();
    };
    sync();
    const id = window.setInterval(sync, HUD_MASK_POLL_MS);
    return () => window.clearInterval(id);
  }, [canvasElement, casingMaterial, coreMaterial, invalidate]);
  const camera = useThree((state) => state.camera);
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
      const particles = createGroundWindParticles(field, heightAt, 7, points, GROUND_WIND_PARTICLES_MAX, model);
      particles.screenProject = screenProject;
      particles.screenUnproject = screenUnproject;
      particles.viewWidth = size.width;
      particles.viewHeight = size.height;
      particles.medianKmh = medianKmh;
      particles.cityModel = model;
      particlesRef.current = particles;
      layoutPendingRef.current = true;
      layoutDigestRef.current = "";
      geometry.instanceCount = 0;
      if (debugWind && typeof window !== "undefined") {
        window.__citycutGroundWindAudit = () => groundWindDebugSnapshot(particles, field, model, heightAt);
      }
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
    const digest = `${camera.position.x.toFixed(2)}:${camera.position.y.toFixed(2)}:${camera.position.z.toFixed(2)}:${(camera as THREE.PerspectiveCamera).zoom?.toFixed(3) ?? "1"}`;
    if (digest !== cameraDigestRef.current) {
      cameraDigestRef.current = digest;
      cameraSettleRef.current = 0;
    } else {
      cameraSettleRef.current += delta;
    }
    const cameraSettled = cameraSettleRef.current > 0.4;
    const needsInitialLayout = layoutPendingRef.current && cameraSettled;
    const needsCameraRelayout = !layoutPendingRef.current && cameraSettled && layoutDigestRef.current !== digest;
    if (needsInitialLayout || needsCameraRelayout) {
      layoutDigestRef.current = digest;
      layoutPendingRef.current = false;
      cameraSettleRef.current = 0;
      particles.metresPerPx = groundWindMedianMetresPerPixel(camera, particles, heightAt, size.height, projScratch);
      if (typeof window !== "undefined") {
        (window as Window & { __citycutGroundWindMpp?: number }).__citycutGroundWindMpp = particles.metresPerPx;
      }
      const activeCount = layoutGroundWindScreenSeeds(particles, field, heightAt, model, 7);
      geometry.instanceCount = activeCount * GROUND_WIND_POINTS_PER_PARTICLE - 1;
      const warmS = needsInitialLayout
        ? frozenRef.current
          ? WARM_FROZEN_S
          : WARM_LIVE_S
        : 1.1;
      warmGroundWindParticles(particles, field, heightAt, metresPerSecond, warmS);
      data.needsUpdate = true;
      if (debugWind && typeof window !== "undefined") {
        window.__citycutGroundWind = groundWindRenderStats(particles, size.width);
      }
      invalidate();
      return;
    }
    if (frozenRef.current) return;
    stepGroundWindParticles(particles, field, heightAt, Math.min(delta, MAX_FRAME_DT), metresPerSecond);
    data.needsUpdate = true;
    if (debugWind && typeof window !== "undefined") {
      debugFrameRef.current += 1;
      if (debugFrameRef.current % 8 === 0) {
        window.__citycutGroundWind = groundWindRenderStats(particles, size.width);
      }
    }
    invalidate();
  });

  return (
    <>
      <mesh geometry={geometry} material={casingMaterial} frustumCulled={false} renderOrder={SURFACE.building.renderOrder - 0.55} />
      <mesh geometry={geometry} material={coreMaterial} frustumCulled={false} renderOrder={SURFACE.building.renderOrder - 0.5} />
    </>
  );
}
