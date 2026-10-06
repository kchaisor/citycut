import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { downwindFromSector, type WindPeriodStats } from "../lib/windRose";

const STREAK_COUNT = 2000;
const STREAK_LENGTH_M = 14;

const vertexShader = /* glsl */ `
attribute float aPhase;
attribute float aAlong;
uniform float uTime;
uniform vec2 uWind;
uniform float uSpeed;
uniform float uSide;
varying float vAlpha;

void main() {
  vec3 p = position;
  float travel = uSpeed * uTime + aPhase;
  float span = uSide * 1.1;
  float along = mod(aAlong + travel, span) - span * 0.5;
  p.x += uWind.x * along;
  p.z += uWind.y * along;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = 0.12 + 0.5 * smoothstep(0.0, 1.0, 1.0 - abs(aAlong) / (${STREAK_LENGTH_M.toFixed(1)} * 0.5));
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

function streakGeometry(sideM: number, windEast: number, windNorth: number): THREE.BufferGeometry {
  const len = STREAK_LENGTH_M;
  const positions: number[] = [];
  const phases: number[] = [];
  const alongs: number[] = [];
  const dx = windEast * len;
  const dz = -windNorth * len;

  for (let i = 0; i < STREAK_COUNT; i++) {
    const seed = hash(i);
    const east = (seed.a - 0.5) * sideM * 0.94;
    const north = (seed.b - 0.5) * sideM * 0.94;
    const y = 6 + seed.c * 36;
    const z = -north;
    positions.push(east, y, z, east + dx, y, z + dz);
    const phase = seed.d * sideM;
    phases.push(phase, phase);
    alongs.push(-len * 0.5, len * 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(alongs, 1));
  return geometry;
}

function hash(i: number): { a: number; b: number; c: number; d: number } {
  const f = fract(Math.sin(i * 127.1) * 43758.5453);
  return {
    a: fract(Math.sin(i * 12.9898) * 43758.5453),
    b: fract(Math.sin(i * 78.233) * 12345.6789),
    c: fract(f * 1.31),
    d: fract(f * 2.17),
  };
}

function fract(n: number): number {
  return n - Math.floor(n);
}

export function WindStreaks({
  sideM,
  stats,
  animate,
}: {
  sideM: number;
  stats: WindPeriodStats;
  animate: boolean;
}) {
  const colourTick = useColourRevision();
  const wind = downwindFromSector(stats.prevailingSector);
  const material = useMemo(() => {
    const color = new THREE.Color(getColour("--wind-streak"));
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(wind.east, -wind.north) },
        uSpeed: { value: Math.max(2, stats.prevailingMedianKmh * 0.07) },
        uSide: { value: sideM },
        uColor: { value: color },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
  }, [stats.prevailingMedianKmh, stats.prevailingSector, sideM, colourTick, wind.east, wind.north]);

  const geometry = useMemo(
    () => streakGeometry(sideM, wind.east, wind.north),
    [sideM, wind.east, wind.north],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    if (!animate) return;
    material.uniforms.uTime.value += delta;
  });

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={900} />;
}

export function WindStaticArrows({ sideM, stats }: { sideM: number; stats: WindPeriodStats }) {
  const colourTick = useColourRevision();
  const { geometry, material } = useMemo(() => {
    const wind = downwindFromSector(stats.prevailingSector);
    const positions: number[] = [];
    const half = sideM / 2;
    const len = sideM * 0.07;
    for (let i = 0; i < 28; i++) {
      const east = -half + ((i * 17) % 100) / 100 * sideM;
      const north = -half + ((i * 29) % 100) / 100 * sideM;
      const y = 8 + (i % 6) * 5;
      positions.push(east, y, -north, east + wind.east * len, y, -north - wind.north * len);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: getColour("--wind-streak"),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
  }, [sideM, stats.prevailingSector, colourTick]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <lineSegments geometry={geometry} material={material} renderOrder={900} />;
}
