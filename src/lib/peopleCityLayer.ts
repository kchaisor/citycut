import * as THREE from "three";
import type { SelectedSa1 } from "./censusPeople";
import { getColour, type ColourKey } from "./colours";
import { sa1Centroid, type LensIndex } from "./peopleLens";
import { sa1DotModes, TRAVEL_MODES, type TravelMode } from "./peopleMetrics";
import { markScreenOnly } from "./screenOnly";
import { siteFrameHalf, type SiteFrameShape } from "./siteFrame";
import { groundHeightAt } from "./viewshed";
import type { CityModel, Pt } from "../types";

export const PRISM_TWEEN_MS = 600;
export const WALK_MS = 5200;
export const WALK_HOLD_MS = 1600;
const MIN_PRISM_M = 0.6;
const DOT_LIFT_M = 2.2;
const LENS_LIFT_M = 1.5;
const RAMP: readonly ColourKey[] = ["--people-1", "--people-2", "--people-3", "--people-4", "--people-5"];
const MODE_KEYS: Record<TravelMode, ColourKey> = Object.fromEntries(TRAVEL_MODES.map((m) => [m.id, m.key])) as Record<
  TravelMode,
  ColourKey
>;

export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function walkTarget(home: Pt, dest: Pt, sideM: number, shape: SiteFrameShape): Pt {
  const half = siteFrameHalf(sideM) * 0.98;
  const inside = shape === "circle" ? Math.hypot(dest[0], dest[1]) <= half : Math.abs(dest[0]) <= half && Math.abs(dest[1]) <= half;
  if (inside) return dest;
  const dx = dest[0] - home[0];
  const dy = dest[1] - home[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return home;
  const ux = dx / len;
  const uy = dy / len;
  let s: number;
  if (shape === "circle") {
    const b = home[0] * ux + home[1] * uy;
    const c = home[0] * home[0] + home[1] * home[1] - half * half;
    s = -b + Math.sqrt(Math.max(0, b * b - c));
  } else {
    const sx = ux > 0 ? (half - home[0]) / ux : ux < 0 ? (-half - home[0]) / ux : Infinity;
    const sy = uy > 0 ? (half - home[1]) / uy : uy < 0 ? (-half - home[1]) / uy : Infinity;
    s = Math.min(sx, sy);
  }
  s = Math.max(0, Math.min(s, len));
  return [home[0] + ux * s, home[1] + uy * s];
}

function tokenColour(key: ColourKey): THREE.Color {
  return new THREE.Color(getColour(key));
}

function dotTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = d <= 0.82 ? 255 : d <= 1 ? Math.round(255 * (1 - (d - 0.82) / 0.18)) : 0;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

type Prism = {
  code: string;
  index: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  edgeMaterial: THREE.LineBasicMaterial;
  base: number;
  centroid: Pt;
  from: number;
  to: number;
  current: number;
  step: number;
};

type Dot = { home: Pt; target: Pt; mode: TravelMode; owner: number; ground: number };

export class PeopleCityLayer {
  readonly root = new THREE.Group();
  private readonly prismRoot = new THREE.Group();
  private readonly lensRoot = new THREE.Group();
  private readonly pinRoot = new THREE.Group();
  private prisms: Prism[] = [];
  private byCode = new Map<string, number>();
  private tweenStart = -1;
  private dots: Dot[] = [];
  private points: THREE.Points | null = null;
  private dotTex: THREE.DataTexture | null = null;
  private dotsOn = false;
  private modes: Record<TravelMode, boolean> = { pt: true, active: true, car: true, home: true, other: true };
  private playStart = -1;
  private dotsDirty = false;
  private highlight: Set<string> | null = null;
  private selected: string | null = null;
  private lensRing: THREE.LineLoop | null = null;
  private lensFill: THREE.Mesh | null = null;
  private lensCentre: Pt | null = null;
  private lensRadius = 0;
  private lensY = 0;

  constructor(
    private readonly model: Pick<CityModel, "terrain" | "sideM">,
    private readonly shape: SiteFrameShape,
  ) {
    this.root.name = "PeopleCity";
    this.root.userData.noScenePick = true;
    markScreenOnly(this.root);
    this.prismRoot.visible = false;
    this.lensRoot.visible = false;
    this.root.add(this.prismRoot, this.lensRoot, this.pinRoot);
  }

  private ground(e: number, n: number): number {
    return groundHeightAt(this.model, e, n);
  }

  setSa1(sa1: readonly SelectedSa1[], index: LensIndex | null): void {
    this.clearPrisms();
    this.clearDots();
    sa1.forEach((s, i) => {
      const shapes: THREE.Shape[] = [];
      let base = Infinity;
      for (const polygon of s.clipped) {
        const [outer, ...holes] = polygon.map((ring) => {
          const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
          for (const [e, n] of open) base = Math.min(base, this.ground(e, n));
          return open.map(([e, n]) => new THREE.Vector2(e, n));
        });
        if (!outer || outer.length < 3) continue;
        const shape = new THREE.Shape(outer);
        for (const hole of holes) if (hole.length >= 3) shape.holes.push(new THREE.Path(hole));
        shapes.push(shape);
      }
      if (shapes.length === 0) return;
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshLambertMaterial({ color: tokenColour("--people-2"), transparent: true, opacity: 0.94 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.peopleSa1 = s.code;
      const edgeMaterial = new THREE.LineBasicMaterial({ color: tokenColour("--people-benchmark"), transparent: true, opacity: 0.45 });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial);
      const group = new THREE.Group();
      group.add(mesh, edges);
      group.position.y = Number.isFinite(base) ? base : 0;
      group.scale.y = MIN_PRISM_M;
      this.prismRoot.add(group);
      this.byCode.set(s.code, this.prisms.length);
      this.prisms.push({
        code: s.code,
        group,
        mesh,
        material,
        edgeMaterial,
        base: group.position.y,
        centroid: sa1Centroid(s.clipped.flat()),
        from: MIN_PRISM_M,
        to: MIN_PRISM_M,
        current: MIN_PRISM_M,
        step: 0,
        index: i,
      });
    });
    if (index) this.buildDots(sa1, index);
    this.repaint();
  }

  private buildDots(sa1: readonly SelectedSa1[], index: LensIndex): void {
    const cellsBy = new Map<number, number[]>();
    for (let at = 0; at < index.owners.length; at += 1) {
      const own = index.owners[at];
      if (own < 0) continue;
      let list = cellsBy.get(own);
      if (!list) cellsBy.set(own, (list = []));
      list.push(at);
    }
    const half = index.sideM / 2;
    sa1.forEach((s, i) => {
      const cells = cellsBy.get(i);
      const prism = this.byCode.get(s.code);
      if (!cells || cells.length === 0 || prism === undefined) return;
      const random = mulberry32(hashCode(s.code));
      for (const mode of sa1DotModes(s)) {
        const at = cells[Math.floor(random() * cells.length)];
        const row = Math.floor(at / index.size);
        const col = at % index.size;
        const home: Pt = [-half + (col + random()) * index.cell, -half + (row + random()) * index.cell];
        this.dots.push({ home, target: home, mode, owner: prism, ground: this.ground(home[0], home[1]) });
      }
    });
    if (this.dots.length === 0) return;
    this.dotTex = dotTexture();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.dots.length * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.dots.length * 3), 3));
    const material = new THREE.PointsMaterial({
      size: 6,
      sizeAttenuation: false,
      vertexColors: true,
      map: this.dotTex,
      alphaTest: 0.4,
      transparent: true,
      depthTest: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.renderOrder = 955;
    this.points.frustumCulled = false;
    this.points.visible = this.dotsOn;
    this.root.add(this.points);
    this.dotsDirty = true;
  }

  get dotCount(): number {
    return this.dots.length;
  }

  setDestinations(cbd: Pt, ptStops: readonly Pt[] | null): void {
    const random = mulberry32(7);
    for (const dot of this.dots) {
      let dest = cbd;
      if (dot.mode === "pt" && ptStops && ptStops.length > 0) {
        let best = ptStops[0];
        let bestD = Infinity;
        for (const stop of ptStops) {
          const d = Math.hypot(stop[0] - dot.home[0], stop[1] - dot.home[1]);
          if (d < bestD) {
            bestD = d;
            best = stop;
          }
        }
        dest = best;
      }
      const end = walkTarget(dot.home, dest, this.model.sideM, this.shape);
      const jitter = 6;
      dot.target = dot.mode === "home" ? dot.home : [end[0] + (random() - 0.5) * jitter, end[1] + (random() - 0.5) * jitter];
    }
    this.dotsDirty = true;
  }

  setPrismsVisible(on: boolean): void {
    this.prismRoot.visible = on;
    this.dotsDirty = true;
  }

  get prismsVisible(): boolean {
    return this.prismRoot.visible;
  }

  setHeights(heights: readonly number[], steps: readonly number[], now: number, animate = true): void {
    this.prisms.forEach((prism) => {
      const next = Math.max(MIN_PRISM_M, heights[prism.index] ?? 0);
      prism.step = steps[prism.index] ?? 0;
      prism.from = prism.current;
      prism.to = next;
      if (!animate) {
        prism.current = next;
        prism.group.scale.y = next;
      }
    });
    this.tweenStart = animate ? now : -1;
    this.repaint();
    this.dotsDirty = true;
  }

  setHighlight(codes: readonly string[] | null): void {
    this.highlight = codes ? new Set(codes) : null;
    this.repaint();
  }

  setSelected(code: string | null): void {
    this.selected = code;
    this.repaint();
  }

  private repaint(): void {
    const ramp = RAMP.map(tokenColour);
    const lit = tokenColour("--people-highlight");
    const edge = tokenColour("--people-benchmark");
    const selectedEdge = tokenColour("--people-lens");
    for (const prism of this.prisms) {
      const on = this.highlight ? this.highlight.has(prism.code) : true;
      prism.material.color.copy(this.highlight ? (on ? lit : ramp[0]) : ramp[prism.step] ?? ramp[0]);
      prism.material.opacity = on ? 0.94 : 0.4;
      prism.material.depthWrite = on;
      const selected = prism.code === this.selected;
      prism.edgeMaterial.color.copy(selected ? selectedEdge : edge);
      prism.edgeMaterial.opacity = selected ? 1 : on ? 0.45 : 0.15;
    }
  }

  setDots(on: boolean, modes: Record<TravelMode, boolean>): void {
    this.dotsOn = on;
    this.modes = modes;
    if (this.points) this.points.visible = on;
    this.dotsDirty = true;
  }

  setPlaying(on: boolean, now: number): void {
    if (on && this.playStart < 0) this.playStart = now;
    if (!on) this.playStart = -1;
    this.dotsDirty = true;
  }

  setLens(centre: Pt | null, radius: number): void {
    this.lensCentre = centre;
    this.lensRadius = radius;
    this.lensRoot.visible = centre !== null;
    if (!centre) return;
    if (!this.lensRing) {
      const ringMaterial = new THREE.LineBasicMaterial({ color: tokenColour("--people-lens"), depthTest: false, transparent: true });
      this.lensRing = new THREE.LineLoop(new THREE.BufferGeometry(), ringMaterial);
      this.lensRing.renderOrder = 962;
      this.lensRing.frustumCulled = false;
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: tokenColour("--people-lens-fill"),
        transparent: true,
        opacity: 0.22,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.lensFill = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), fillMaterial);
      this.lensFill.renderOrder = 961;
      this.lensRoot.add(this.lensFill, this.lensRing);
    }
    this.lensY = this.ground(centre[0], centre[1]) + LENS_LIFT_M;
    this.lensRing.geometry.dispose();
    this.lensRing.geometry = this.ringGeometry(centre, radius);
    this.lensFill!.position.set(centre[0], this.lensY, -centre[1]);
    this.lensFill!.scale.set(radius, 1, radius);
  }

  private ringGeometry(centre: Pt, radius: number, segments = 96): THREE.BufferGeometry {
    const positions = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const e = centre[0] + Math.cos(a) * radius;
      const n = centre[1] + Math.sin(a) * radius;
      positions[i * 3] = e;
      positions[i * 3 + 1] = this.ground(e, n) + LENS_LIFT_M;
      positions[i * 3 + 2] = -n;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }

  setPins(pins: readonly { centre: Pt; radius: number }[]): void {
    for (const child of [...this.pinRoot.children]) {
      this.pinRoot.remove(child);
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    for (const pin of pins) {
      const line = new THREE.LineLoop(
        this.ringGeometry(pin.centre, pin.radius),
        new THREE.LineDashedMaterial({ color: tokenColour("--people-pin"), dashSize: 6, gapSize: 5, depthTest: false, transparent: true }),
      );
      line.computeLineDistances();
      line.renderOrder = 960;
      line.frustumCulled = false;
      this.pinRoot.add(line);
    }
  }

  setPinsVisible(on: boolean): void {
    this.pinRoot.visible = on;
  }

  pointOnLensPlane(ray: THREE.Ray): Pt | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.lensY);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? [hit.x, -hit.z] : null;
  }

  hitLens(ray: THREE.Ray): boolean {
    if (!this.lensRoot.visible || !this.lensCentre) return false;
    const p = this.pointOnLensPlane(ray);
    return Boolean(p && Math.hypot(p[0] - this.lensCentre[0], p[1] - this.lensCentre[1]) <= this.lensRadius);
  }

  pickPrism(raycaster: THREE.Raycaster): string | null {
    if (!this.prismRoot.visible) return null;
    const hits = raycaster.intersectObjects(
      this.prisms.map((p) => p.mesh),
      false,
    );
    return (hits[0]?.object.userData.peopleSa1 as string | undefined) ?? null;
  }

  prismTop(code: string): THREE.Vector3 | null {
    const at = this.byCode.get(code);
    if (at === undefined) return null;
    const prism = this.prisms[at];
    const top = this.prismRoot.visible ? prism.base + prism.current : this.ground(prism.centroid[0], prism.centroid[1]);
    return new THREE.Vector3(prism.centroid[0], top, -prism.centroid[1]);
  }

  lensAnchor(): THREE.Vector3 | null {
    if (!this.lensCentre || !this.lensRoot.visible) return null;
    return new THREE.Vector3(this.lensCentre[0] + this.lensRadius * 0.72, this.lensY, -(this.lensCentre[1] - this.lensRadius * 0.72));
  }

  update(now: number): boolean {
    let moved = false;
    if (this.tweenStart >= 0) {
      const t = (now - this.tweenStart) / PRISM_TWEEN_MS;
      const k = easeInOut(t);
      for (const prism of this.prisms) {
        prism.current = prism.from + (prism.to - prism.from) * k;
        prism.group.scale.y = prism.current;
      }
      if (t >= 1) this.tweenStart = -1;
      moved = true;
      this.dotsDirty = true;
    }
    if (this.playStart >= 0 && this.dotsOn) this.dotsDirty = true;
    if (this.dotsDirty && this.points && this.dotsOn) {
      this.writeDots(now);
      moved = true;
    }
    return moved;
  }

  private writeDots(now: number): void {
    const points = this.points!;
    const position = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colour = points.geometry.getAttribute("color") as THREE.BufferAttribute;
    const colours = Object.fromEntries(TRAVEL_MODES.map((m) => [m.id, tokenColour(MODE_KEYS[m.id])])) as Record<TravelMode, THREE.Color>;
    const cycle = WALK_MS + WALK_HOLD_MS;
    const t = this.playStart >= 0 ? Math.min(1, ((now - this.playStart) % cycle) / WALK_MS) : 0;
    const k = easeInOut(t);
    const drop = Math.min(1, t / 0.2);
    let n = 0;
    for (const dot of this.dots) {
      if (!this.modes[dot.mode]) continue;
      const prism = this.prisms[dot.owner];
      const lift = this.prismRoot.visible && prism ? prism.current : 0;
      const e = dot.home[0] + (dot.target[0] - dot.home[0]) * k;
      const nn = dot.home[1] + (dot.target[1] - dot.home[1]) * k;
      const walking = this.playStart >= 0 && dot.mode !== "home";
      const y = walking
        ? this.ground(e, nn) + DOT_LIFT_M + lift * (1 - drop)
        : (prism ? prism.base : dot.ground) + lift + DOT_LIFT_M;
      position.setXYZ(n, e, walking || !this.prismRoot.visible ? Math.max(y, dot.ground + DOT_LIFT_M) : y, -nn);
      const c = colours[dot.mode];
      colour.setXYZ(n, c.r, c.g, c.b);
      n += 1;
    }
    points.geometry.setDrawRange(0, n);
    position.needsUpdate = true;
    colour.needsUpdate = true;
    this.dotsDirty = this.playStart >= 0;
  }

  private clearPrisms(): void {
    for (const prism of this.prisms) {
      this.prismRoot.remove(prism.group);
      prism.mesh.geometry.dispose();
      prism.material.dispose();
      prism.edgeMaterial.dispose();
      for (const child of prism.group.children) (child as THREE.Mesh).geometry.dispose();
    }
    this.prisms = [];
    this.byCode.clear();
  }

  private clearDots(): void {
    if (this.points) {
      this.root.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
    }
    this.dotTex?.dispose();
    this.points = null;
    this.dotTex = null;
    this.dots = [];
  }

  dispose(): void {
    this.clearPrisms();
    this.clearDots();
    this.setPins([]);
    this.lensRing?.geometry.dispose();
    (this.lensRing?.material as THREE.Material | undefined)?.dispose();
    this.lensFill?.geometry.dispose();
    (this.lensFill?.material as THREE.Material | undefined)?.dispose();
  }
}
