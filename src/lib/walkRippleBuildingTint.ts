import * as THREE from "three";
import { BUILDING_USE_META, buildingLayerName } from "./buildingUse";
import type { BuildingUse } from "../types";
import { getColour } from "./colours";
import {
  patchBuildingMaterialForRipple,
  rippleColourUniforms,
  type RippleShaderUniforms,
} from "./walkRippleShader";

type SavedMaterial = THREE.Material | THREE.Material[];

const BUILDING_MESH_NAMES = new Set(
  (Object.keys(BUILDING_USE_META) as BuildingUse[]).map((use) => buildingLayerName(use)),
);

function isBuildingMeshName(name: string): boolean {
  if (name.startsWith("Buildings") || name.startsWith("source:")) return true;
  if (name === "Buildings-manual" || name === "Buildings-site" || name === "Buildings::Site") return true;
  return BUILDING_MESH_NAMES.has(name);
}

function buildingMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name || mesh.parent?.name || "";
    if (isBuildingMeshName(name)) meshes.push(mesh);
  });
  return meshes;
}

function setArrivalAttribute(geometry: THREE.BufferGeometry, arrivalMin: number, originId: number): void {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const count = position.count;
  const arrivals = new Float32Array(count);
  const origins = new Float32Array(count);
  arrivals.fill(arrivalMin);
  origins.fill(originId);
  geometry.setAttribute("aRippleArrival", new THREE.BufferAttribute(arrivals, 1));
  geometry.setAttribute("aRippleOrigin", new THREE.BufferAttribute(origins, 1));
}

function applyArrivalToMesh(
  mesh: THREE.Mesh,
  arrivalByBuildingId: Map<number, number>,
  originByBuildingId: Map<number, number>,
): void {
  const geometry = mesh.geometry;
  const buildingId = mesh.userData.buildingId as number | undefined;
  const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
  const position = geometry.getAttribute("position");
  if (!position) return;

  if (buildingId !== undefined && buildingId >= 0) {
    const arrival = arrivalByBuildingId.get(buildingId) ?? 999;
    const origin = originByBuildingId.get(buildingId) ?? 0;
    setArrivalAttribute(geometry, arrival, origin);
    return;
  }

  if (byGroup?.length && geometry.groups?.length) {
    const arrivals = new Float32Array(position.count);
    const origins = new Float32Array(position.count);
    arrivals.fill(999);
    origins.fill(0);
    geometry.groups.forEach((group, groupIndex) => {
      const id = byGroup[groupIndex];
      if (id === undefined || id < 0) return;
      const arrival = arrivalByBuildingId.get(id) ?? 999;
      const origin = originByBuildingId.get(id) ?? 0;
      for (let i = group.start; i < group.start + group.count; i++) {
        arrivals[i] = arrival;
        origins[i] = origin;
      }
    });
    geometry.setAttribute("aRippleArrival", new THREE.BufferAttribute(arrivals, 1));
    geometry.setAttribute("aRippleOrigin", new THREE.BufferAttribute(origins, 1));
    return;
  }

  setArrivalAttribute(geometry, 999, 0);
}

export class WalkRippleBuildingTint {
  readonly uniforms: RippleShaderUniforms = rippleColourUniforms();
  private saved = new Map<THREE.Mesh, SavedMaterial>();
  private attached = false;

  attach(
    root: THREE.Object3D,
    arrivalByBuildingId: Map<number, number>,
    originByBuildingId: Map<number, number>,
    rivalCount: number,
  ): void {
    this.detach();
    this.uniforms.uRivalCount.value = rivalCount >= 2 ? rivalCount : 0;
    for (const mesh of buildingMeshes(root)) {
      this.saved.set(mesh, mesh.material);
      applyArrivalToMesh(mesh, arrivalByBuildingId, originByBuildingId);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = materials.map((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
        const clone = mat.clone();
        patchBuildingMaterialForRipple(clone, this.uniforms);
        return clone;
      });
      mesh.material = next.length === 1 ? next[0]! : next;
    }
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    for (const [mesh, material] of this.saved) {
      mesh.material = material;
      const attr = mesh.geometry.getAttribute("aRippleArrival");
      if (attr) mesh.geometry.deleteAttribute("aRippleArrival");
      const originAttr = mesh.geometry.getAttribute("aRippleOrigin");
      if (originAttr) mesh.geometry.deleteAttribute("aRippleOrigin");
    }
    this.saved.clear();
    this.uniforms.uRippleTime.value = -1;
    this.attached = false;
  }

  setRippleTimeMinutes(minutes: number): void {
    this.uniforms.uRippleTime.value = minutes;
  }

  refreshColours(): void {
    this.uniforms.uBand0.value.setStyle(getColour("--walk-ripple-band-0"));
    this.uniforms.uBand1.value.setStyle(getColour("--walk-ripple-band-1"));
    this.uniforms.uBand2.value.setStyle(getColour("--walk-ripple-band-2"));
    this.uniforms.uAccent.value.setStyle(getColour("--walk-ripple-accent"));
    this.uniforms.uOrigin0.value.setStyle(getColour("--walk-ripple-origin-0"));
    this.uniforms.uOrigin1.value.setStyle(getColour("--walk-ripple-origin-1"));
    this.uniforms.uOrigin2.value.setStyle(getColour("--walk-ripple-origin-2"));
  }
}
