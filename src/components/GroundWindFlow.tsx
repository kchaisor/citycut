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
import type { WindPeriodStats } from "../lib/windRose";

const FIELD_BUDGET_MS = 4;
const MAX_FRAME_DT = 0.05;
const HUD_MASK_POLL_MS = 500;

const VERTEX_SHADER = `
attribute float speed;
attribute float alpha;
uniform vec2 resolution;
varying float vSpeed;
varying float vAlpha;
varying vec2 vScreenPx;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreenPx = (clip.xy / max(1e-5, clip.w) * 0.5 + 0.5) * resolution;
  vSpeed = speed;
  vAlpha = alpha;
  gl_Position = clip;
}
`;

const FRAGMENT_SHADER = `
uniform vec2 resolution;
uniform vec3 shelteredColour;
uniform vec3 openColour;
uniform vec3 speedingColour;
uniform vec4 maskRight;
uniform vec4 maskBottom;
varying float vSpeed;
varying float vAlpha;
varying vec2 vScreenPx;
void main() {
  vec2 css = vec2(vScreenPx.x, resolution.y - vScreenPx.y);
  if (css.x >= maskRight.x && css.x <= maskRight.z && css.y >= maskRight.y && css.y <= maskRight.w) discard;
  if (css.x >= maskBottom.x && css.x <= maskBottom.z && css.y >= maskBottom.y && css.y <= maskBottom.w) discard;
  if (vAlpha < 0.004) discard;
  vec3 slow = mix(shelteredColour, openColour, smoothstep(0.45, 0.85, vSpeed));
  vec3 colour = mix(slow, speedingColour, smoothstep(1.06, 1.3, vSpeed));
  gl_FragColor = vec4(colour, min(0.92, vAlpha));
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
  geometry.setAttribute("speed", new THREE.InterleavedBufferAttribute(data, 1, 3));
  geometry.setAttribute("alpha", new THREE.InterleavedBufferAttribute(data, 1, 4));
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
      shelteredColour: { value: new THREE.Color() },
      openColour: { value: new THREE.Color() },
      speedingColour: { value: new THREE.Color() },
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
  const count = useMemo(() => groundWindStreakCount(model), [model]);
  const { geometry, data, vertices } = useMemo(() => createStreakGeometry(count), [count]);
  const size = useThree((state) => state.size);
  const material = useMemo(() => makeWindMaterial(size.width, size.height), []);
  const invalidate = useThree((state) => state.invalidate);
  const canvasElement = useThree((state) => state.gl.domElement);

  const colourRevision = useColourRevision();
  useEffect(() => {
    (material.uniforms.shelteredColour!.value as THREE.Color).set(getColour("--ground-wind-sheltered"));
    (material.uniforms.openColour!.value as THREE.Color).set(getColour("--ground-wind-open"));
    (material.uniforms.speedingColour!.value as THREE.Color).set(getColour("--ground-wind-speeding"));
    invalidate();
  }, [material, colourRevision, invalidate]);

  useEffect(() => {
    (material.uniforms.resolution!.value as THREE.Vector2).set(size.width, size.height);
  }, [material, size.height, size.width]);

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
