import * as THREE from "three";
import { getColour } from "./colours";
import { CELL_BLOCKED, CELL_VISIBLE, groundHeightAt, type HeightGrid } from "./viewshed";
import type { CityModel, Pt } from "../types";

/** Overlay opacity per state (0–255). Colours come from the --view-* tokens in colours.css. */
export const VIEW_ALPHA = { visible: 220, seen: 120, blocked: 70 } as const;
const OVERLAY_LIFT_M = 0.35;
const PATH_LIFT_M = 0.9;
const PATH_HALF_WIDTH_M = 0.7;
const MARKER_POLE_EXTRA_M = 6;
const RENDER_ORDER = 950;

function hexChannels(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Three.js objects for the View tab walk: the draped visibility overlay, the drawn path
 * (clicked points and a ribbon along the spline) and the walker marker. Lives in the same
 * local frame as the city (x east, y up, z = -north). Never touches the camera.
 */
export class WalkViewshedLayer {
  readonly root = new THREE.Group();
  private readonly points = new THREE.Group();
  private ribbon: THREE.Mesh | null = null;
  private overlay: THREE.Mesh | null = null;
  /** RGBA bytes, row 0 = southern edge; uploaded straight to the GPU (no canvas round trip). */
  private pixels: Uint8Array | null = null;
  private texture: THREE.DataTexture | null = null;
  private grid: HeightGrid | null = null;
  private readonly walker = new THREE.Group();
  private readonly pole: THREE.Mesh;
  private readonly ball: THREE.Mesh;
  private readonly rim: THREE.Mesh;
  private readonly pathMaterial: THREE.MeshBasicMaterial;
  private readonly dotGeometry = new THREE.SphereGeometry(2.2, 16, 12);

  constructor(private readonly model: Pick<CityModel, "terrain" | "sideM">) {
    this.root.name = "ViewshedWalk";
    const pathColour = getColour("--view-path");
    this.pathMaterial = new THREE.MeshBasicMaterial({
      color: pathColour,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    this.root.add(this.points);
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 12), new THREE.MeshBasicMaterial({ color: pathColour, toneMapped: false }));
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: getColour("--view-walker"), toneMapped: false }));
    this.rim = new THREE.Mesh(
      new THREE.SphereGeometry(6.2, 24, 16),
      new THREE.MeshBasicMaterial({ color: pathColour, side: THREE.BackSide, toneMapped: false }),
    );
    this.walker.add(this.pole, this.ball, this.rim);
    this.walker.visible = false;
    this.walker.traverse((object) => {
      object.renderOrder = RENDER_ORDER + 10;
    });
    this.root.add(this.walker);
  }

  private z(east: number, north: number): number {
    return groundHeightAt(this.model, east, north);
  }

  /** Clicked points as dots and the spline (already sampled finely) as a draped ribbon. */
  setPath(clicked: readonly Pt[], line: readonly Pt[]): void {
    for (const child of [...this.points.children]) {
      this.points.remove(child);
      (child as THREE.InstancedMesh).dispose?.();
    }
    if (clicked.length) {
      // One draw call for all clicks.
      const dots = new THREE.InstancedMesh(this.dotGeometry, this.pathMaterial, clicked.length);
      const m = new THREE.Matrix4();
      clicked.forEach(([e, n], i) => dots.setMatrixAt(i, m.makeTranslation(e, this.z(e, n) + 1.2, -n)));
      dots.instanceMatrix.needsUpdate = true;
      dots.computeBoundingSphere();
      dots.renderOrder = RENDER_ORDER + 9;
      this.points.add(dots);
    }
    if (this.ribbon) {
      this.root.remove(this.ribbon);
      this.ribbon.geometry.dispose();
      this.ribbon = null;
    }
    if (line.length < 2) return;
    const positions: number[] = [];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * PATH_HALF_WIDTH_M;
      const oy = (dx / len) * PATH_HALF_WIDTH_M;
      const corner = (e: number, n: number) => [e, this.z(e, n) + PATH_LIFT_M, -n];
      const q0 = corner(a[0] + ox, a[1] + oy);
      const q1 = corner(a[0] - ox, a[1] - oy);
      const q2 = corner(b[0] - ox, b[1] - oy);
      const q3 = corner(b[0] + ox, b[1] + oy);
      positions.push(...q0, ...q1, ...q2, ...q0, ...q2, ...q3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.ribbon = new THREE.Mesh(geometry, this.pathMaterial);
    this.ribbon.renderOrder = RENDER_ORDER + 8;
    this.root.add(this.ribbon);
  }

  /** Allocate the draped overlay for a computed grid. */
  setGrid(grid: HeightGrid | null): void {
    this.clearOverlay();
    this.grid = grid;
    if (!grid) return;
    this.pixels = new Uint8Array(grid.cols * grid.rows * 4);
    this.texture = new THREE.DataTexture(this.pixels, grid.cols, grid.rows, THREE.RGBAFormat);
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.LinearFilter;
    const width = grid.cols * grid.cell;
    const height = grid.rows * grid.cell;
    const segX = Math.min(300, grid.cols);
    const segY = Math.min(300, grid.rows);
    const geometry = new THREE.PlaneGeometry(width, height, segX, segY);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    const cx = grid.x0 + width / 2;
    const cy = grid.y0 + height / 2;
    for (let i = 0; i < position.count; i++) {
      const e = position.getX(i) + cx;
      const n = -position.getZ(i) + cy;
      position.setXYZ(i, e, this.z(e, n) + OVERLAY_LIFT_M, -n);
    }
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.overlay = new THREE.Mesh(geometry, material);
    this.overlay.name = "ViewshedOverlay";
    this.overlay.renderOrder = RENDER_ORDER;
    this.root.add(this.overlay);
  }

  /** Paint one frame: visible now, seen earlier (when `seen` is given), not visible. */
  paint(frame: Uint8Array | null, seen: Uint8Array | null): void {
    const grid = this.grid;
    if (!grid || !this.pixels || !this.texture) return;
    const visible = hexChannels(getColour("--view-visible"));
    const seenRgb = hexChannels(getColour("--view-seen"));
    const blocked = hexChannels(getColour("--view-blocked"));
    const data = this.pixels;
    const { cols, rows } = grid;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const o = k * 4;
        const v = frame ? frame[k] : 0;
        let colour: [number, number, number] | null = null;
        let alpha = 0;
        if (v === CELL_VISIBLE) {
          colour = visible;
          alpha = VIEW_ALPHA.visible;
        } else if (seen && seen[k]) {
          colour = seenRgb;
          alpha = VIEW_ALPHA.seen;
        } else if (v === CELL_BLOCKED) {
          colour = blocked;
          alpha = VIEW_ALPHA.blocked;
        }
        if (colour) {
          data[o] = colour[0];
          data[o + 1] = colour[1];
          data[o + 2] = colour[2];
        }
        data[o + 3] = alpha;
      }
    }
    this.texture.needsUpdate = true;
  }

  setWalker(at: Pt | null, eyeHeight: number): void {
    if (!at) {
      this.walker.visible = false;
      return;
    }
    const top = eyeHeight + MARKER_POLE_EXTRA_M;
    this.pole.scale.set(1, top, 1);
    this.pole.position.y = top / 2;
    this.ball.position.y = top;
    this.rim.position.y = top;
    this.walker.position.set(at[0], this.z(at[0], at[1]), -at[1]);
    this.walker.visible = true;
  }

  private clearOverlay(): void {
    if (this.overlay) {
      this.root.remove(this.overlay);
      this.overlay.geometry.dispose();
      (this.overlay.material as THREE.Material).dispose();
      this.overlay = null;
    }
    this.texture?.dispose();
    this.texture = null;
    this.pixels = null;
    this.grid = null;
  }

  clearAll(): void {
    this.setPath([], []);
    this.clearOverlay();
    this.setWalker(null, 0);
  }

  dispose(): void {
    this.clearAll();
    this.dotGeometry.dispose();
    this.pathMaterial.dispose();
    for (const mesh of [this.pole, this.ball, this.rim]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
