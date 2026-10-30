import * as THREE from "three";
import { getColour, type ColourKey } from "./colours";
import { pointInSiteFrame, type SiteFrameShape } from "./siteFrame";
import { groundHeightAt } from "./viewshed";
import type { CityModel, Pt } from "../types";

export const SA1_RASTER_SIZE = 256;
const LIFT_M = 0.45;
const RENDER_ORDER = 940;
const ALPHA = { base: 120, dim: 55, hovered: 215, edge: 235 } as const;
const RAMP_KEYS: readonly ColourKey[] = ["--people-1", "--people-2", "--people-3", "--people-4", "--people-5"];

export type Sa1OverlayArea = { code: string; rings: readonly (readonly Pt[])[]; step: number };

export function rasterizeSa1Owners(
  areas: readonly Pick<Sa1OverlayArea, "rings">[],
  sideM: number,
  shape: SiteFrameShape,
  size = SA1_RASTER_SIZE,
): Int16Array {
  const owners = new Int16Array(size * size).fill(-1);
  const cell = sideM / size;
  const half = sideM / 2;
  const crossings: number[] = [];
  for (let row = 0; row < size; row += 1) {
    const y = -half + (row + 0.5) * cell;
    areas.forEach((area, index) => {
      crossings.length = 0;
      for (const ring of area.rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > y !== yj > y) crossings.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil((crossings[k] + half) / cell - 0.5));
        const to = Math.min(size - 1, Math.floor((crossings[k + 1] + half) / cell - 0.5));
        for (let col = from; col <= to; col += 1) owners[row * size + col] = index;
      }
    });
    if (shape !== "square") {
      for (let col = 0; col < size; col += 1) {
        if (!pointInSiteFrame([-half + (col + 0.5) * cell, y], sideM, shape)) owners[row * size + col] = -1;
      }
    }
  }
  return owners;
}

export function sa1EdgeMask(owners: Int16Array, size = SA1_RASTER_SIZE): Uint8Array {
  const edges = new Uint8Array(owners.length);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const at = row * size + col;
      const own = owners[at];
      if (own < 0) continue;
      const right = col + 1 < size ? owners[at + 1] : own;
      const up = row + 1 < size ? owners[at + size] : own;
      const left = col > 0 ? owners[at - 1] : own;
      const down = row > 0 ? owners[at - size] : own;
      if ((right !== own && right >= 0) || (up !== own && up >= 0) || (left !== own && left >= 0) || (down !== own && down >= 0)) {
        edges[at] = 1;
      }
    }
  }
  return edges;
}

function channels(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export class CensusSa1Layer {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private texture: THREE.DataTexture | null = null;
  private pixels: Uint8Array | null = null;
  private owners: Int16Array | null = null;
  private edges: Uint8Array | null = null;
  private areas: readonly Sa1OverlayArea[] = [];
  private hovered: string | null = null;

  constructor(
    private readonly model: Pick<CityModel, "terrain" | "sideM">,
    private readonly shape: SiteFrameShape,
  ) {
    this.root.name = "CensusSa1Overlay";
    this.root.visible = false;
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  setAreas(areas: readonly Sa1OverlayArea[]): void {
    this.areas = areas;
    if (areas.length === 0) {
      this.clear();
      return;
    }
    this.owners = rasterizeSa1Owners(areas, this.model.sideM, this.shape);
    this.edges = sa1EdgeMask(this.owners);
    if (!this.mesh) this.build();
    this.paint();
  }

  setHovered(code: string | null): void {
    if (this.hovered === code) return;
    this.hovered = code;
    this.paint();
  }

  private build(): void {
    const size = SA1_RASTER_SIZE;
    const side = this.model.sideM;
    this.pixels = new Uint8Array(size * size * 4);
    this.texture = new THREE.DataTexture(this.pixels, size, size, THREE.RGBAFormat);
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    const segments = Math.min(200, size);
    const geometry = new THREE.PlaneGeometry(side, side, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      const e = position.getX(i);
      const n = -position.getZ(i);
      position.setXYZ(i, e, groundHeightAt(this.model, e, n) + LIFT_M, -n);
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
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = RENDER_ORDER;
    this.root.add(this.mesh);
  }

  private paint(): void {
    const { pixels, owners, edges, texture } = this;
    if (!pixels || !owners || !edges || !texture) return;
    const ramp = RAMP_KEYS.map((key) => channels(getColour(key)));
    const edge = channels(getColour("--people-benchmark"));
    const hoveredIndex = this.hovered ? this.areas.findIndex((area) => area.code === this.hovered) : -1;
    for (let i = 0; i < owners.length; i += 1) {
      const own = owners[i];
      const o = i * 4;
      if (own < 0) {
        pixels[o + 3] = 0;
        continue;
      }
      const isHovered = own === hoveredIndex;
      const rgb = edges[i] ? edge : (ramp[this.areas[own].step] ?? ramp[0]);
      pixels[o] = rgb[0];
      pixels[o + 1] = rgb[1];
      pixels[o + 2] = rgb[2];
      pixels[o + 3] = edges[i]
        ? hoveredIndex < 0 || isHovered
          ? ALPHA.edge
          : ALPHA.dim
        : isHovered
          ? ALPHA.hovered
          : hoveredIndex >= 0
            ? ALPHA.dim
            : ALPHA.base;
    }
    texture.needsUpdate = true;
  }

  private clear(): void {
    if (!this.mesh) return;
    this.root.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture?.dispose();
    this.mesh = null;
    this.texture = null;
    this.pixels = null;
    this.owners = null;
    this.edges = null;
  }

  dispose(): void {
    this.clear();
  }
}
