import * as THREE from "three";
import { cssColorToHex } from "../cssVars";
import type { TerrainField } from "../../types";
import { sampleTerrain } from "../terrain";
import { flowVisualNormSpeed } from "./flowVisualNorm";
import type { WindLbmSolverState } from "./types";
import { WIND_TRAIL_SAMPLES, type WindFlowParticle } from "./windParticles";

const WIND_LIFT_M = 1.75;
const DRAW_TRAIL_SAMPLES = 14;

function hexRgb(hex: string): [number, number, number] {
  const body = (cssColorToHex(hex) ?? hex).replace("#", "");
  return [
    parseInt(body.slice(0, 2), 16) / 255,
    parseInt(body.slice(2, 4), 16) / 255,
    parseInt(body.slice(4, 6), 16) / 255,
  ];
}

export function windFlowGroundY(
  east: number,
  north: number,
  sideM: number,
  terrain: TerrainField | null | undefined,
  plinthBottomY: number,
): number {
  const ground = terrain ? sampleTerrain(terrain, east, north, sideM) : 0;
  return Math.max(plinthBottomY + 0.08, ground + WIND_LIFT_M);
}

export function windFlowSpeedColor(t: number, calmHex: string, fastHex: string, target: THREE.Color): THREE.Color {
  const tw = Math.min(1, Math.max(0.12, t));
  const calm = hexRgb(calmHex);
  const fast = hexRgb(fastHex);
  return target.setRGB(
    calm[0] * (1 - tw) + fast[0] * tw,
    calm[1] * (1 - tw) + fast[1] * tw,
    calm[2] * (1 - tw) + fast[2] * tw,
  );
}

export function windFlowTrailSegmentCapM(solver: WindLbmSolverState | null, sideM: number): number {
  if (solver) return (solver.spec.sideM / solver.spec.nx) * 3.2;
  return (sideM / 256) * 3.2;
}

type TrailPoint = { east: number; north: number; speedT: number };

function trailPoints(
  p: WindFlowParticle,
  half: number,
  normSpeed: number,
): TrailPoint[] {
  const out: TrailPoint[] = [];
  for (let t = 0; t < DRAW_TRAIL_SAMPLES; t++) {
    const idx = (p.trailHead - t + WIND_TRAIL_SAMPLES) % WIND_TRAIL_SAMPLES;
    const east = p.trailEast[idx]!;
    const north = p.trailNorth[idx]!;
    if (Math.abs(east) > half || Math.abs(north) > half) continue;
    const speed = Math.hypot(p.lastUx, p.lastUy);
    const speedT = Math.min(1.35, speed / Math.max(normSpeed, 1e-4));
    out.push({ east, north, speedT });
  }
  return out;
}

export function fillWindFlowLineBuffers(
  particles: readonly WindFlowParticle[],
  half: number,
  sideM: number,
  terrain: TerrainField | null | undefined,
  plinthBottomY: number,
  maxSegM: number,
  normSpeed: number,
  flowReveal: number,
  streakHex: string,
  streakBrightHex: string,
  positions: Float32Array,
  colors: Float32Array,
): number {
  const scratch = new THREE.Color();
  let vi = 0;
  const headOpacity = flowReveal;
  const tailOpacity = 0.55 * flowReveal;
  for (const p of particles) {
    const trail = trailPoints(p, half, normSpeed);
    if (trail.length < 2) continue;
    let current: TrailPoint[] = [trail[trail.length - 1]!];
    const segments: TrailPoint[][] = [];
    for (let i = trail.length - 2; i >= 0; i--) {
      const a = current[current.length - 1]!;
      const b = trail[i]!;
      const jump = Math.hypot(a.east - b.east, a.north - b.north);
      if (jump > maxSegM) {
        if (current.length >= 2) segments.push(current);
        current = [b];
      } else {
        current.push(b);
      }
    }
    if (current.length >= 2) segments.push(current);
    for (const seg of segments) {
      for (let i = seg.length - 2; i >= 0; i--) {
        const head = seg[i]!;
        const tail = seg[i + 1]!;
        const fade = 1 - i / Math.max(1, seg.length - 1);
        const y0 = windFlowGroundY(tail.east, tail.north, sideM, terrain, plinthBottomY);
        const y1 = windFlowGroundY(head.east, head.north, sideM, terrain, plinthBottomY);
        const t0 = tail.speedT * (0.35 + 0.65 * fade);
        const t1 = head.speedT;
        const cTail = windFlowSpeedColor(t0, streakHex, streakBrightHex, scratch);
        const cHead = windFlowSpeedColor(t1, streakHex, streakBrightHex, scratch);
        const base = vi * 3;
        positions[base] = tail.east;
        positions[base + 1] = y0;
        positions[base + 2] = -tail.north;
        positions[base + 3] = head.east;
        positions[base + 4] = y1;
        positions[base + 5] = -head.north;
        const tailFade = 0.55 + fade * 0.35;
        const boost = 1.15;
        colors[base] = Math.min(1, cTail.r * tailFade * tailOpacity * boost);
        colors[base + 1] = Math.min(1, cTail.g * tailFade * tailOpacity * boost);
        colors[base + 2] = Math.min(1, cTail.b * tailFade * tailOpacity * boost);
        colors[base + 3] = Math.min(1, cHead.r * headOpacity * boost);
        colors[base + 4] = Math.min(1, cHead.g * headOpacity * boost);
        colors[base + 5] = Math.min(1, cHead.b * headOpacity * boost);
        vi += 2;
        if (vi * 3 >= positions.length) return vi;
      }
    }
  }
  return vi;
}

export function buildHeatmapTerrainMesh(
  solver: WindLbmSolverState,
  sideM: number,
  terrain: TerrainField | null | undefined,
  plinthBottomY: number,
  calmHex: string,
  fastHex: string,
  grid = 96,
): THREE.Mesh {
  const half = solver.spec.cutSideM / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const scratch = new THREE.Color();
  const norm = Math.max(1e-4, flowVisualNormSpeed(solver));
  const calm = hexRgb(calmHex);
  const fast = hexRgb(fastHex);
  let vi = 0;
  for (let j = 0; j <= grid; j++) {
    const north = -half + (j / grid) * (half * 2);
    for (let i = 0; i <= grid; i++) {
      const east = -half + (i / grid) * (half * 2);
      const y = windFlowGroundY(east, north, sideM, terrain, plinthBottomY) + 0.12;
      positions.push(east, y, -north);
      const { ux, uy, blocked } = sampleSolverCell(solver, east, north);
      if (blocked) {
        colors.push(0, 0, 0);
      } else {
        const t = Math.min(1, Math.hypot(ux, uy) / norm);
        const tw = 0.1 + t * 0.9;
        scratch.setRGB(
          calm[0] * (1 - tw) + fast[0] * tw,
          calm[1] * (1 - tw) + fast[1] * tw,
          calm[2] * (1 - tw) + fast[2] * tw,
        );
        colors.push(scratch.r, scratch.g, scratch.b);
      }
      if (i < grid && j < grid) {
        const a = vi;
        const b = vi + 1;
        const c = vi + grid + 1;
        const d = vi + grid + 2;
        indices.push(a, c, b, b, c, d);
      }
      vi++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 860;
  mesh.frustumCulled = false;
  return mesh;
}

function sampleSolverCell(
  state: WindLbmSolverState,
  east: number,
  north: number,
): { ux: number; uy: number; blocked: boolean } {
  const { spec, obstacle, ux, uy } = state;
  const domainHalf = spec.sideM / 2;
  const fx = ((east + domainHalf) / spec.sideM) * spec.nx;
  const fy = ((north + domainHalf) / spec.sideM) * spec.ny;
  const i = Math.min(spec.nx - 1, Math.max(0, Math.floor(fx)));
  const j = Math.min(spec.ny - 1, Math.max(0, Math.floor(fy)));
  const cell = i + j * spec.nx;
  if (obstacle[cell]) return { ux: 0, uy: 0, blocked: true };
  return { ux: ux[cell]!, uy: uy[cell]!, blocked: false };
}
