import * as THREE from "three";
import { getColour, type ColourKey } from "./colours";

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
const MATERIAL_COLOUR_KEYS = ["color", "emissive"] as const;

type Rgb = readonly [number, number, number];
type MaterialGreyState = { rest: Rgb; written: Rgb };
type AttributeGreyState = { rest: Float32Array; version: number };

export const MONO_WATER_MESH_NAME = "Water";
export const MONO_WATER_FILL: ColourKey = "--water-3d-mono";
export const MONO_WATER_LAYER_ID = "water";

const flatWaterByRest = new WeakMap<THREE.Material, THREE.MeshBasicMaterial>();
const restByFlatWater = new WeakMap<THREE.Material, THREE.Material>();

const materialStates = new WeakMap<THREE.Material, Map<string, MaterialGreyState>>();
const attributeStates = new WeakMap<THREE.BufferAttribute, AttributeGreyState>();

export function linearLuminance(r: number, g: number, b: number): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}

export function greyscaleColour(color: THREE.Color): THREE.Color {
  const y = linearLuminance(color.r, color.g, color.b);
  return color.setRGB(y, y, y);
}

export function greyscaleHex(hex: string): string {
  return `#${greyscaleColour(new THREE.Color(hex)).getHexString().toUpperCase()}`;
}

export function monoSwatchColour(layerId: string, colour: string): string {
  return layerId === MONO_WATER_LAYER_ID ? getColour(MONO_WATER_FILL) : greyscaleHex(colour);
}

function flatWaterMaterial(rest: THREE.Material): THREE.MeshBasicMaterial {
  const cached = flatWaterByRest.get(rest);
  if (cached) return cached;
  const flat = new THREE.MeshBasicMaterial({ toneMapped: false });
  flat.name = rest.name;
  flat.side = rest.side;
  flat.transparent = rest.transparent;
  flat.opacity = rest.opacity;
  flat.depthTest = rest.depthTest;
  flat.depthWrite = rest.depthWrite;
  flat.polygonOffset = rest.polygonOffset;
  flat.polygonOffsetFactor = rest.polygonOffsetFactor;
  flat.polygonOffsetUnits = rest.polygonOffsetUnits;
  flat.clippingPlanes = rest.clippingPlanes;
  flatWaterByRest.set(rest, flat);
  restByFlatWater.set(flat, rest);
  return flat;
}

function setFlatWater(mesh: THREE.Mesh, on: boolean): boolean {
  if (Array.isArray(mesh.material)) return false;
  const rest = restByFlatWater.get(mesh.material);
  if (!on) {
    if (rest) mesh.material = rest;
    return false;
  }
  const flat = rest ? (mesh.material as THREE.MeshBasicMaterial) : flatWaterMaterial(mesh.material);
  flat.color.setStyle(getColour(MONO_WATER_FILL));
  mesh.material = flat;
  return true;
}

export function restoreFlatWater(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.name === MONO_WATER_MESH_NAME && mesh.material) setFlatWater(mesh, false);
  });
}

function rgbOf(color: THREE.Color): Rgb {
  return [color.r, color.g, color.b];
}

function sameRgb(color: THREE.Color, rgb: Rgb): boolean {
  return color.r === rgb[0] && color.g === rgb[1] && color.b === rgb[2];
}

function greyscaleMaterial(material: THREE.Material, on: boolean): void {
  let states = materialStates.get(material);
  for (const key of MATERIAL_COLOUR_KEYS) {
    const color = (material as unknown as Record<string, unknown>)[key];
    if (!(color instanceof THREE.Color)) continue;
    const state = states?.get(key);
    const untouched = state !== undefined && sameRgb(color, state.written);
    if (on) {
      const rest = untouched ? state.rest : rgbOf(color);
      color.setRGB(rest[0], rest[1], rest[2]);
      greyscaleColour(color);
      if (!states) {
        states = new Map();
        materialStates.set(material, states);
      }
      states.set(key, { rest, written: rgbOf(color) });
    } else if (state) {
      if (untouched) color.setRGB(state.rest[0], state.rest[1], state.rest[2]);
      states?.delete(key);
    }
  }
}

function greyscaleColourAttribute(attr: THREE.BufferAttribute, on: boolean): void {
  const state = attributeStates.get(attr);
  const untouched = state !== undefined && attr.version === state.version;
  const array = attr.array as Float32Array;
  if (on) {
    const rest = untouched ? state.rest : new Float32Array(array);
    for (let i = 0; i + 2 < rest.length; i += 3) {
      const y = linearLuminance(rest[i]!, rest[i + 1]!, rest[i + 2]!);
      array[i] = y;
      array[i + 1] = y;
      array[i + 2] = y;
    }
    attr.needsUpdate = true;
    attributeStates.set(attr, { rest, version: attr.version });
  } else if (state) {
    if (untouched) {
      array.set(state.rest);
      attr.needsUpdate = true;
    }
    attributeStates.delete(attr);
  }
}

export function isSunHoursFaceObject(object: THREE.Object3D): boolean {
  return Boolean(object.userData?.sunHoursFaces);
}

export function applySolarGreyscale(root: THREE.Object3D, on: boolean): void {
  const seenMaterials = new Set<THREE.Material>();
  const seenAttributes = new Set<THREE.BufferAttribute>();
  root.traverse((object) => {
    const drawable = object as THREE.Mesh;
    if (!drawable.material) return;
    if (isSunHoursFaceObject(object)) return;
    if (object.name === MONO_WATER_MESH_NAME && setFlatWater(drawable, on)) return;
    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    for (const material of materials) {
      if (seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      greyscaleMaterial(material, on);
    }
    const colours = drawable.geometry?.getAttribute("color");
    if (colours instanceof THREE.BufferAttribute && colours.itemSize === 3 && !seenAttributes.has(colours)) {
      seenAttributes.add(colours);
      greyscaleColourAttribute(colours, on);
    }
  });
}
