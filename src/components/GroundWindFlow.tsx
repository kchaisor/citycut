import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityModel } from "../types";
import { getColour } from "../lib/colours";
import {
  createGroundWindGridBuilder,
  groundWindFieldCache,
  groundWindHeightAt,
  groundWindSector,
  type GroundWindFlowGrid,
  type GroundWindGridBuilder,
} from "../lib/groundWindField";
import {
  createGroundWindStreaks,
  GROUND_WIND_INDICES_PER_STREAK,
  GROUND_WIND_VERTEX_STRIDE,
  GROUND_WIND_VERTS_PER_STREAK,
  groundWindMetresPerSecond,
  groundWindStreakCount,
  groundWindStreakIndices,
  stepGroundWindStreaks,
  warmGroundWindStreaks,
  writeGroundWindStreakVertices,
  type GroundWindStreaks,
} from "../lib/groundWindStreaks";
import { useColourRevision } from "../lib/useColourRevision";
import { GROUND_WIND_EMPTY_MASK_RECT, groundWindHudMaskFromDom, type GroundWindMaskRect } from "../lib/groundWindHudMask";
import { SURFACE } from "../lib/surfaceLayers";
import { sectorCenterDeg, type WindPeriodStats } from "../lib/windRose";
import { GROUND_WIND_RAMP } from "../lib/groundWindRamp";
import { useWindStreakDensity } from "../lib/windStreakDensity";

declare global {
  interface Window {
    __citycutGroundWind?: { readonly streaks: number; readonly heading: number };
  }
}

const FIELD_BUDGET_MS = 4;
const MAX_FRAME_DT = 0.05;
const HUD_MASK_POLL_MS = 500;

const LINE_WIDTH_PX = 1.5;
const LINE_FRINGE_PX = 0.6;
const RAMP_SIZE = GROUND_WIND_RAMP.length;

const VERTEX_SHADER = `
attribute vec2 tangent;
attribute float side;
attribute float speed;
attribute float alpha;
uniform vec2 resolution;
uniform float halfWidthPx;
varying float vSpeed;
varying float vAlpha;
varying float vSide;
varying vec2 vScreenPx;
void main() {
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec4 clip = mvp * vec4(position, 1.0);
  vec4 ahead = mvp * vec4(position + vec3(tangent.x, 0.0, tangent.y), 1.0);
  vec2 dir = (ahead.xy / max(1e-5, ahead.w) - clip.xy / max(1e-5, clip.w)) * resolution;
  float len = length(dir);
  vec2 normal = len > 1e-6 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  clip.xy += normal * side * halfWidthPx * 2.0 / resolution * clip.w;
  vScreenPx = (clip.xy / max(1e-5, clip.w) * 0.5 + 0.5) * resolution;
  vSpeed = speed;
  vAlpha = alpha;
  vSide = side;
  gl_Position = clip;
}
`;

const FRAGMENT_SHADER = `
#define RAMP_SIZE ${RAMP_SIZE}
uniform vec2 resolution;
uniform float halfWidthPx;
uniform float lineHalfPx;
uniform vec3 rampColour[RAMP_SIZE];
uniform float rampSpeed[RAMP_SIZE];
uniform vec4 maskRight;
uniform vec4 maskBottom;
varying float vSpeed;
varying float vAlpha;
varying float vSide;
varying vec2 vScreenPx;
vec3 rampAt(float speed) {
  vec3 colour = rampColour[0];
  for (int i = 1; i < RAMP_SIZE; i++) {
    float t = clamp((speed - rampSpeed[i - 1]) / (rampSpeed[i] - rampSpeed[i - 1]), 0.0, 1.0);
    colour = mix(colour, rampColour[i], t);
  }
  return colour;
}
void main() {
  vec2 css = vec2(vScreenPx.x, resolution.y - vScreenPx.y);
  if (css.x >= maskRight.x && css.x <= maskRight.z && css.y >= maskRight.y && css.y <= maskRight.w) discard;
  if (css.x >= maskBottom.x && css.x <= maskBottom.z && css.y >= maskBottom.y && css.y <= maskBottom.w) discard;
  float coverage = clamp(lineHalfPx + 0.5 - abs(vSide) * halfWidthPx, 0.0, 1.0);
  float a = vAlpha * coverage;
  if (a < 0.004) discard;
  gl_FragColor = vec4(rampAt(vSpeed), a);
}
`;

function reducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createStreakGeometry(count: number) {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(count * GROUND_WIND_VERTS_PER_STREAK * GROUND_WIND_VERTEX_STRIDE);
  const data = new THREE.InterleavedBuffer(vertices, GROUND_WIND_VERTEX_STRIDE);
  data.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(data, 3, 0));
  geometry.setAttribute("tangent", new THREE.InterleavedBufferAttribute(data, 2, 3));
  geometry.setAttribute("side", new THREE.InterleavedBufferAttribute(data, 1, 5));
  geometry.setAttribute("speed", new THREE.InterleavedBufferAttribute(data, 1, 6));
  geometry.setAttribute("alpha", new THREE.InterleavedBufferAttribute(data, 1, 7));
  geometry.setIndex(new THREE.BufferAttribute(groundWindStreakIndices(count), 1));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Number.POSITIVE_INFINITY);
  return { geometry, data, vertices };
}

function makeWindMaterial(width: number, height: number) {
  const empty = GROUND_WIND_EMPTY_MASK_RECT;
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      resolution: { value: new THREE.Vector2(width, height) },
      halfWidthPx: { value: LINE_WIDTH_PX / 2 + LINE_FRINGE_PX },
      lineHalfPx: { value: LINE_WIDTH_PX / 2 },
      rampColour: { value: GROUND_WIND_RAMP.map(() => new THREE.Color()) },
      rampSpeed: { value: GROUND_WIND_RAMP.map((stop) => stop.speed) },
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

function applyMaskRect(uniform: THREE.IUniform, rect: GroundWindMaskRect): boolean {
  const v = uniform.value as THREE.Vector4;
  if (v.x === rect.x0 && v.y === rect.y0 && v.z === rect.x1 && v.w === rect.y1) return false;
  v.set(rect.x0, rect.y0, rect.x1, rect.y1);
  return true;
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
  const sector = groundWindSector(stats?.prevailingSector);
  const metresPerSecond = groundWindMetresPerSecond(
    model.sideM,
    stats?.prevailingMeanSpeedMs ? stats.prevailingMeanSpeedMs * 3.6 : stats?.prevailingMedianKmh,
  );
  const heightAt = useCallback((east: number, north: number) => groundWindHeightAt(model, east, north), [model]);
  const frozen = !animate || reducedMotionPreferred();
  const density = useWindStreakDensity();
  const count = useMemo(() => groundWindStreakCount(model, density), [model, density]);
  const { geometry, data, vertices } = useMemo(() => createStreakGeometry(count), [count]);
  const size = useThree((state) => state.size);
  const material = useMemo(() => makeWindMaterial(size.width, size.height), []);
  const invalidate = useThree((state) => state.invalidate);
  const canvasElement = useThree((state) => state.gl.domElement);

  const colourRevision = useColourRevision();
  useEffect(() => {
    const ramp = material.uniforms.rampColour!.value as THREE.Color[];
    GROUND_WIND_RAMP.forEach((stop, i) => ramp[i]!.set(getColour(stop.token)));
    invalidate();
  }, [material, colourRevision, invalidate]);

  useEffect(() => {
    (material.uniforms.resolution!.value as THREE.Vector2).set(size.width, size.height);
  }, [material, size.height, size.width]);

  useEffect(() => {
    window.__citycutGroundWind = { streaks: count, heading: sectorCenterDeg(sector) };
    return () => {
      delete window.__citycutGroundWind;
    };
  }, [count, sector]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const sync = () => {
      const mask = groundWindHudMaskFromDom(canvasElement);
      const right = applyMaskRect(material.uniforms.maskRight!, mask.right);
      const bottom = applyMaskRect(material.uniforms.maskBottom!, mask.bottom);
      if (right || bottom) invalidate();
    };
    sync();
    const id = window.setInterval(sync, HUD_MASK_POLL_MS);
    return () => window.clearInterval(id);
  }, [canvasElement, material, invalidate]);

  const builderRef = useRef<GroundWindGridBuilder | null>(null);
  const gridRef = useRef<GroundWindFlowGrid | null>(null);
  const streaksRef = useRef<GroundWindStreaks | null>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const speedRef = useRef(metresPerSecond);
  speedRef.current = metresPerSecond;

  useEffect(() => {
    streaksRef.current = null;
    gridRef.current = null;
    geometry.setDrawRange(0, 0);
  }, [model, geometry]);

  useEffect(() => {
    builderRef.current = createGroundWindGridBuilder(groundWindFieldCache(model), sector);
    invalidate();
  }, [model, sector, geometry, invalidate]);

  useEffect(() => {
    if (!frozen) invalidate();
  }, [frozen, invalidate]);

  const upload = (streaks: GroundWindStreaks) => {
    const drawn = writeGroundWindStreakVertices(streaks);
    data.needsUpdate = true;
    data.updateRanges.length = 0;
    data.addUpdateRange(0, drawn * GROUND_WIND_VERTS_PER_STREAK * GROUND_WIND_VERTEX_STRIDE);
    geometry.setDrawRange(0, drawn * GROUND_WIND_INDICES_PER_STREAK);
  };

  useFrame((_, delta) => {
    const builder = builderRef.current;
    if (builder) {
      if (!builder.step(FIELD_BUDGET_MS)) {
        invalidate();
        return;
      }
      const grid = builder.finish();
      builderRef.current = null;
      gridRef.current = grid;
      if (!streaksRef.current) {
        const streaks = createGroundWindStreaks(model, grid, heightAt, speedRef.current, count, vertices);
        warmGroundWindStreaks(streaks, grid, heightAt, speedRef.current);
        streaksRef.current = streaks;
      } else if (frozenRef.current) {
        warmGroundWindStreaks(streaksRef.current, grid, heightAt, speedRef.current);
      }
      upload(streaksRef.current);
      invalidate();
      return;
    }
    const grid = gridRef.current;
    const streaks = streaksRef.current;
    if (!grid || !streaks || frozenRef.current) return;
    stepGroundWindStreaks(streaks, grid, heightAt, speedRef.current, Math.min(delta, MAX_FRAME_DT));
    upload(streaks);
    invalidate();
  });

  return (
    <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={SURFACE.building.renderOrder - 0.5} />
  );
}
