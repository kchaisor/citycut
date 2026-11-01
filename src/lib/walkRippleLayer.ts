import * as THREE from "three";
import { getColour } from "./colours";
import { groundHeightAt } from "./viewshed";
import { equalTimeSplitM } from "./walkRippleMultiSource";
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
const ORIGIN_COLOUR_VARS = ["--walk-ripple-origin-0", "--walk-ripple-origin-1", "--walk-ripple-origin-2"] as const;

function zAt(model: Pick<CityModel, "terrain" | "sideM">, east: number, north: number): number {
  return groundHeightAt(model, east, north);
}

export class WalkRippleLayer {
  readonly root = new THREE.Group();
  readonly uniforms: RippleShaderUniforms = rippleColourUniforms();
  private networkMesh: THREE.Mesh | null = null;
  private seamLines: THREE.LineSegments | null = null;
  private ringGroup: THREE.Group | null = null;
  private originMarkers: THREE.Mesh[] = [];
  private labelGroup: THREE.Group | null = null;
  private disposeGeometries: THREE.BufferGeometry[] = [];
  private onOriginDrag: ((index: number, east: number, north: number) => void) | null = null;

  constructor(private readonly model: Pick<CityModel, "terrain" | "sideM">) {
    this.root.name = "WalkRipple";
  }

  setOriginDragHandler(handler: ((index: number, east: number, north: number) => void) | null): void {
    this.onOriginDrag = handler;
  }

  originMarkerMeshes(): readonly THREE.Mesh[] {
    return this.originMarkers;
  }

  clear(): void {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
    }
    for (const geo of this.disposeGeometries) geo.dispose();
    this.disposeGeometries = [];
    for (const marker of this.originMarkers) {
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    }
    this.originMarkers = [];
    this.networkMesh = null;
    this.seamLines = null;
    this.ringGroup = null;
    this.labelGroup = null;
    this.uniforms.uRippleTime.value = -1;
    this.uniforms.uRivalCount.value = 0;
  }

  setRippleTimeMinutes(minutes: number): void {
    this.uniforms.uRippleTime.value = minutes;
  }

  setRivalMode(originCount: number): void {
    this.uniforms.uRivalCount.value = originCount >= 2 ? originCount : 0;
    this.uniforms.uOrigin0.value.setStyle(getColour("--walk-ripple-origin-0"));
    this.uniforms.uOrigin1.value.setStyle(getColour("--walk-ripple-origin-1"));
    this.uniforms.uOrigin2.value.setStyle(getColour("--walk-ripple-origin-2"));
  }

  showOrigins(origins: readonly Pt[]): void {
    for (const marker of this.originMarkers) {
      this.root.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    }
    this.originMarkers = [];
    origins.forEach(([e, n], index) => {
      const r = Math.max(4, Math.min(9, this.model.sideM * 0.012));
      const geo = new THREE.SphereGeometry(r, 20, 14);
      const token = ORIGIN_COLOUR_VARS[index] ?? "--walk-ripple-accent";
      const mat = new THREE.MeshBasicMaterial({
        color: getColour(token),
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(e, zAt(this.model, e, n) + ORIGIN_LIFT_M, -n);
      mesh.renderOrder = RENDER_ORDER + 5 + index;
      mesh.userData.walkRippleOriginIndex = index;
      this.originMarkers.push(mesh);
      this.root.add(mesh);
    });
  }

  setNetworkWave(
    network: WalkNetwork,
    edgeVertexTimes: Float32Array,
    edgeVertexOriginId: Float32Array,
    nodeTimes?: Float64Array,
    nodeOriginId?: Uint8Array,
  ): void {
    if (this.networkMesh) {
      this.root.remove(this.networkMesh);
      this.networkMesh.geometry.dispose();
      (this.networkMesh.material as THREE.Material).dispose();
      this.networkMesh = null;
    }
    const positions: number[] = [];
    const arrivals: number[] = [];
    const origins: number[] = [];
    const hw = RIBBON_HALF_WIDTH_M;
    const mpm = 1 / WALK_RIPPLE_SPEED_MPM;
    network.edges.forEach((edge, edgeIndex) => {
      const base = edgeIndex * 4;
      const ta = edgeVertexTimes[base]!;
      const tb = edgeVertexTimes[base + 2]!;
      const oa = edgeVertexOriginId[base]!;
      const ob = edgeVertexOriginId[base + 2]!;
      const pushQuad = (
        ax: number,
        ay: number,
        bx: number,
        by: number,
        tStart: number,
        tEnd: number,
        oStart: number,
        oEnd: number,
      ) => {
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * hw;
        const oy = (dx / len) * hw;
        const corner = (e: number, n: number, tMin: number, o: number) => {
          const z = zAt(this.model, e, n) + LINE_LIFT_M;
          positions.push(e, z, -n);
          arrivals.push(tMin);
          origins.push(o);
        };
        corner(ax + ox, ay + oy, tStart, oStart);
        corner(ax - ox, ay - oy, tStart, oStart);
        corner(bx + ox, by + oy, tEnd, oEnd);
        corner(ax + ox, ay + oy, tStart, oStart);
        corner(bx + ox, by + oy, tEnd, oEnd);
        corner(bx - ox, by - oy, tEnd, oEnd);
      };
      if (oa === ob || !nodeTimes || !nodeOriginId) {
        pushQuad(edge.ax, edge.ay, edge.bx, edge.by, ta, tb, oa, ob);
        return;
      }
      const nodeTa = nodeTimes[edge.a]!;
      const nodeTb = nodeTimes[edge.b]!;
      const splitM = equalTimeSplitM(edge, nodeTa, nodeTb);
      const tAlong = splitM / edge.lengthM;
      const mx = edge.ax + (edge.bx - edge.ax) * tAlong;
      const my = edge.ay + (edge.by - edge.ay) * tAlong;
      const tSplit = nodeTa + splitM * mpm;
      pushQuad(edge.ax, edge.ay, mx, my, ta, tSplit, oa, oa);
      pushQuad(mx, my, edge.bx, edge.by, tSplit, tb, ob, ob);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aRippleArrival", new THREE.Float32BufferAttribute(arrivals, 1));
    geometry.setAttribute("aRippleOrigin", new THREE.Float32BufferAttribute(origins, 1));
    const material = createRippleNetworkRibbonMaterial(this.uniforms);
    const lines = new THREE.Mesh(geometry, material);
    lines.userData.noScenePick = true;
    lines.renderOrder = RENDER_ORDER + 2;
    this.networkMesh = lines;
    this.disposeGeometries.push(geometry);
    this.root.add(lines);
  }

  setSeamLines(seamSegments: Float32Array): void {
    if (this.seamLines) {
      this.root.remove(this.seamLines);
      this.seamLines.geometry.dispose();
      (this.seamLines.material as THREE.Material).dispose();
      this.seamLines = null;
    }
    if (seamSegments.length < 4) return;
    const positions: number[] = [];
    for (let i = 0; i < seamSegments.length; i += 4) {
      const x1 = seamSegments[i]!;
      const y1 = seamSegments[i + 1]!;
      const x2 = seamSegments[i + 2]!;
      const y2 = seamSegments[i + 3]!;
      const z1 = zAt(this.model, x1, y1) + LINE_LIFT_M + 0.35;
      const z2 = zAt(this.model, x2, y2) + LINE_LIFT_M + 0.35;
      positions.push(x1, z1, -y1, x2, z2, -y2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: getColour("--walk-ripple-seam"),
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.userData.noScenePick = true;
    lines.renderOrder = RENDER_ORDER + 4;
    this.seamLines = lines;
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
    const rivalCount = times.mode === "network" ? times.origins.length : 1;
    this.setRivalMode(rivalCount);
    if (times.mode === "network") {
      this.showOrigins(times.origins);
      if (network) {
        this.setNetworkWave(
          network,
          times.edgeVertexTimes,
          times.edgeVertexOriginId,
          times.nodeTimesMin,
          times.nodeOriginId,
        );
        this.setSeamLines(times.seamSegments);
      }
      if (times.origins.length < 2) this.setBandLabels(times.origin, false);
    } else {
      this.showOrigins([times.origin]);
      this.setStraightEstimate(times.origin);
      this.setBandLabels(times.origin, true);
    }
  }

  updateOriginMarkerPosition(index: number, east: number, north: number): void {
    const mesh = this.originMarkers[index];
    if (!mesh) return;
    mesh.position.set(east, zAt(this.model, east, north) + ORIGIN_LIFT_M, -north);
  }

  notifyOriginDrag(index: number, east: number, north: number): void {
    this.onOriginDrag?.(index, east, north);
  }

  dispose(): void {
    this.clear();
  }
}

export function walkRippleModeLabel(times: RippleTimes): string {
  if (times.mode === "network") {
    if (times.origins.length >= 2) {
      return `Rival walk ripples from ${times.origins.length} origins along the street network.`;
    }
    return "Walk ripple generated along the street network.";
  }
  return "Straight-line walk estimate (no street network in this cut).";
}

export { WALK_RIPPLE_MAX_MIN };
