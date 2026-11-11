import * as THREE from "three";
import { getColour } from "./colours";
import { groundHeightAt } from "./viewshed";
import {
  WALK_RIPPLE_BANDS_MIN,
  WALK_RIPPLE_MAX_MIN,
  WALK_RIPPLE_SPEED_MPM,
  type RippleTimes,
  type WalkNetwork,
} from "./walkRippleNetwork";
import { createRippleNetworkRibbonMaterial, rippleColourUniforms, type RippleShaderUniforms } from "./walkRippleShader";
import type { CityModel, Pt } from "../types";

const RENDER_ORDER = 940;
const ORIGIN_LIFT_M = 1.4;
const LINE_LIFT_M = 0.55;
const RIBBON_HALF_WIDTH_M = 2.8;
const RING_SEGMENTS = 64;

function zAt(model: Pick<CityModel, "terrain" | "sideM">, east: number, north: number): number {
  return groundHeightAt(model, east, north);
}

export class WalkRippleLayer {
  readonly root = new THREE.Group();
  readonly uniforms: RippleShaderUniforms = rippleColourUniforms();
  private networkMesh: THREE.Mesh | null = null;
  private ringGroup: THREE.Group | null = null;
  private originMarker: THREE.Mesh | null = null;
  private labelGroup: THREE.Group | null = null;
  private disposeGeometries: THREE.BufferGeometry[] = [];

  constructor(private readonly model: Pick<CityModel, "terrain" | "sideM">) {
    this.root.name = "WalkRipple";
  }

  clear(): void {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
    }
    for (const geo of this.disposeGeometries) geo.dispose();
    this.disposeGeometries = [];
    this.networkMesh = null;
    this.ringGroup = null;
    this.originMarker = null;
    this.labelGroup = null;
    this.uniforms.uRippleTime.value = -1;
  }

  setRippleTimeMinutes(minutes: number): void {
    this.uniforms.uRippleTime.value = minutes;
  }

  showOrigin(origin: Pt): void {
    if (this.originMarker) {
      this.root.remove(this.originMarker);
      this.originMarker.geometry.dispose();
      (this.originMarker.material as THREE.Material).dispose();
      this.originMarker = null;
    }
    const [e, n] = origin;
    const r = Math.max(4, Math.min(9, this.model.sideM * 0.012));
    const geo = new THREE.SphereGeometry(r, 20, 14);
    const mat = new THREE.MeshBasicMaterial({
      color: getColour("--walk-ripple-accent"),
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(e, zAt(this.model, e, n) + ORIGIN_LIFT_M, -n);
    mesh.renderOrder = RENDER_ORDER + 5;
    this.originMarker = mesh;
    this.root.add(mesh);
  }

  setNetworkWave(network: WalkNetwork, edgeVertexTimes: Float32Array): void {
    if (this.networkMesh) {
      this.root.remove(this.networkMesh);
      this.networkMesh.geometry.dispose();
      (this.networkMesh.material as THREE.Material).dispose();
      this.networkMesh = null;
    }
    const positions: number[] = [];
    const arrivals: number[] = [];
    const hw = RIBBON_HALF_WIDTH_M;
    network.edges.forEach((edge, edgeIndex) => {
      const base = edgeIndex * 4;
      const ta = edgeVertexTimes[base]!;
      const tb = edgeVertexTimes[base + 2]!;
      const dx = edge.bx - edge.ax;
      const dy = edge.by - edge.ay;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * hw;
      const oy = (dx / len) * hw;
      const corner = (e: number, n: number, tMin: number) => {
        const z = zAt(this.model, e, n) + LINE_LIFT_M;
        return [e, z, -n, tMin] as const;
      };
      const a0 = corner(edge.ax + ox, edge.ay + oy, ta);
      const a1 = corner(edge.ax - ox, edge.ay - oy, ta);
      const b0 = corner(edge.bx + ox, edge.by + oy, tb);
      const b1 = corner(edge.bx - ox, edge.by - oy, tb);
      for (const c of [a0, a1, b0, a0, b0, b1]) {
        positions.push(c[0], c[1], c[2]);
        arrivals.push(c[3]);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aRippleArrival", new THREE.Float32BufferAttribute(arrivals, 1));
    const material = createRippleNetworkRibbonMaterial(this.uniforms);
    const lines = new THREE.Mesh(geometry, material);
    lines.renderOrder = RENDER_ORDER + 2;
    this.networkMesh = lines;
    this.disposeGeometries.push(geometry);
    this.root.add(lines);
  }

  setStraightEstimate(origin: Pt): void {
    if (this.ringGroup) {
      this.root.remove(this.ringGroup);
      this.ringGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      this.ringGroup = null;
    }
    const group = new THREE.Group();
    group.name = "WalkRippleStraightRings";
    const [ox, oy] = origin;
    const radiiM = WALK_RIPPLE_BANDS_MIN.map((min) => min * WALK_RIPPLE_SPEED_MPM);
    const mat = new THREE.LineBasicMaterial({
      color: getColour("--walk-ripple-accent"),
      transparent: true,
      opacity: 0.55,
      toneMapped: false,
    });
    for (const r of radiiM) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        const e = ox + Math.cos(a) * r;
        const n = oy + Math.sin(a) * r;
        points.push(new THREE.Vector3(e, zAt(this.model, e, n) + LINE_LIFT_M, -n));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const ring = new THREE.LineLoop(geo, mat);
      ring.renderOrder = RENDER_ORDER + 1;
      group.add(ring);
      this.disposeGeometries.push(geo);
    }
    this.ringGroup = group;
    this.root.add(group);
  }

  setBandLabels(origin: Pt, straightLine: boolean): void {
    if (this.labelGroup) {
      this.root.remove(this.labelGroup);
      this.labelGroup = null;
    }
    const group = new THREE.Group();
    group.name = "WalkRippleLabels";
    const [ox, oy] = origin;
    WALK_RIPPLE_BANDS_MIN.forEach((min, index) => {
      const distM = min * WALK_RIPPLE_SPEED_MPM * 0.72;
      const e = ox + distM;
      const n = oy;
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = getColour("--walk-ripple-label-bg");
      ctx.strokeStyle = getColour("--walk-ripple-accent");
      ctx.lineWidth = 4;
      const pad = 8;
      ctx.fillRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2);
      ctx.strokeRect(pad + 1, pad + 1, canvas.width - pad * 2 - 2, canvas.height - pad * 2 - 2);
      ctx.fillStyle = getColour("--walk-ripple-label-text");
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${min} min`, canvas.width / 2, canvas.height / 2);
      if (index === 0 && straightLine) {
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillText("straight-line", canvas.width / 2, canvas.height - 14);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false }),
      );
      sprite.scale.set(28, 14, 1);
      sprite.position.set(e, zAt(this.model, e, n) + 12 + index * 2, -n);
      sprite.renderOrder = RENDER_ORDER + 8;
      group.add(sprite);
    });
    this.labelGroup = group;
    this.root.add(group);
  }

  applyResult(times: RippleTimes, network: WalkNetwork | null): void {
    this.clear();
    this.showOrigin(times.origin);
    if (times.mode === "network" && network) {
      this.setNetworkWave(network, times.edgeVertexTimes);
      this.setBandLabels(times.origin, false);
    } else {
      this.setStraightEstimate(times.origin);
      this.setBandLabels(times.origin, true);
    }
  }

  dispose(): void {
    this.clear();
    if (this.originMarker) {
      this.originMarker.geometry.dispose();
      (this.originMarker.material as THREE.Material).dispose();
    }
  }
}

export function walkRippleModeLabel(times: RippleTimes): string {
  if (times.mode === "network") return "Walk ripple generated along the street network.";
  return "Straight-line walk estimate (no street network in this cut).";
}

export { WALK_RIPPLE_MAX_MIN };
