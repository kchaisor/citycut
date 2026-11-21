import * as THREE from "three";
import type { TerrainField } from "../types";

export const HILLSHADE_AZIMUTH_DEG = 315;
export const HILLSHADE_ALTITUDE_DEG = 50;
export const HILLSHADE_GAIN = 1.6;
export const HILLSHADE_MIN = 0.8;
export const HILLSHADE_MAX = 1.04;

export type HillshadeGrid = {
  cols: number;
  rows: number;
  values: Float32Array;
};

function lightVector(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

export function hillshadeGrid(
  field: Pick<TerrainField, "cols" | "rows" | "heights" | "spacingM">,
  azimuthDeg = HILLSHADE_AZIMUTH_DEG,
  altitudeDeg = HILLSHADE_ALTITUDE_DEG,
): HillshadeGrid {
  const { cols, rows, heights, spacingM } = field;
  const [lx, ly, lz] = lightVector(azimuthDeg, altitudeDeg);
  const values = new Float32Array(cols * rows);
  const at = (col: number, row: number) =>
    heights[Math.min(rows - 1, Math.max(0, row)) * cols + Math.min(cols - 1, Math.max(0, col))]!;
  const step = Math.max(spacingM, 1e-6);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dzdx =
        (at(col + 1, row + 1) + 2 * at(col + 1, row) + at(col + 1, row - 1) -
          (at(col - 1, row + 1) + 2 * at(col - 1, row) + at(col - 1, row - 1))) /
        (8 * step);
      const dzdy =
        (at(col - 1, row + 1) + 2 * at(col, row + 1) + at(col + 1, row + 1) -
          (at(col - 1, row - 1) + 2 * at(col, row - 1) + at(col + 1, row - 1))) /
        (8 * step);
      const length = Math.hypot(dzdx, dzdy, 1);
      const lambert = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / length);
      const relative = lambert / lz;
      const shade = 1 + HILLSHADE_GAIN * (relative - 1);
      values[row * cols + col] = Math.min(HILLSHADE_MAX, Math.max(HILLSHADE_MIN, shade));
    }
  }
  return { cols, rows, values };
}

export function sampleHillshade(grid: HillshadeGrid, east: number, north: number, sideM: number): number {
  const half = sideM / 2;
  const x = Math.min(1, Math.max(0, (east + half) / sideM)) * (grid.cols - 1);
  const y = Math.min(1, Math.max(0, (north + half) / sideM)) * (grid.rows - 1);
  const x0 = Math.min(grid.cols - 1, Math.floor(x));
  const y0 = Math.min(grid.rows - 1, Math.floor(y));
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (col: number, row: number) => grid.values[row * grid.cols + col]!;
  const south = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const northEdge = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return south * (1 - ty) + northEdge * ty;
}

export function shadeRgb(rgb: [number, number, number], shade: number): [number, number, number] {
  return [Math.min(1, rgb[0] * shade), Math.min(1, rgb[1] * shade), Math.min(1, rgb[2] * shade)];
}

type HillshadeUniform = { value: number };

export function hillshadeTexture(grid: HillshadeGrid): THREE.DataTexture {
  const data = new Uint8Array(grid.values.length);
  const span = HILLSHADE_MAX - HILLSHADE_MIN;
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(((grid.values[i]! - HILLSHADE_MIN) / span) * 255);
  }
  const texture = new THREE.DataTexture(data, grid.cols, grid.rows, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function patchHillshadeMaterial(material: THREE.MeshStandardMaterial, texture: THREE.DataTexture, sideM: number): void {
  if (material.userData.hillshadeUniform) return;
  const uniform: HillshadeUniform = { value: 1 };
  material.userData.hillshadeUniform = uniform;
  material.userData.hillshadeMap = texture;
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior?.call(material, shader, renderer);
    shader.uniforms.uHillshade = uniform;
    shader.uniforms.uHillshadeMap = { value: texture };
    shader.uniforms.uHillshadeSide = { value: sideM };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uHillshadeSide;\nvarying vec2 vHillshadeUv;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHillshadeUv = vec2(transformed.x, -transformed.z) / uHillshadeSide + 0.5;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uHillshade;\nuniform sampler2D uHillshadeMap;\nvarying vec2 vHillshadeUv;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nfloat hillshadeValue = ${HILLSHADE_MIN.toFixed(4)} + texture2D(uHillshadeMap, vHillshadeUv).r * ${(HILLSHADE_MAX - HILLSHADE_MIN).toFixed(4)};\ndiffuseColor.rgb *= mix(1.0, hillshadeValue, uHillshade);`,
      );
  };
  const priorKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${priorKey()}|hillshade`;
  material.addEventListener("dispose", () => texture.dispose());
  material.needsUpdate = true;
}

export function attachGroundHillshade(root: THREE.Object3D, texture: THREE.DataTexture, sideM: number): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
      patchHillshadeMaterial(mesh.material, texture, sideM);
    }
  });
}

export function setGroundHillshade(root: THREE.Object3D, on: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const uniform = material.userData.hillshadeUniform as HillshadeUniform | undefined;
      if (uniform) uniform.value = on ? 1 : 0;
    }
  });
}

export function groundHillshadeOn(showHillshade: boolean, groundOverlayOn: boolean): boolean {
  return showHillshade && !groundOverlayOn;
}
