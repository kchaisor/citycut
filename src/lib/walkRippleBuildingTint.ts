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

function setArrivalAttribute(geometry: THREE.BufferGeometry, arrivalMin: number): void {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const count = position.count;
  const data = new Float32Array(count);
  data.fill(arrivalMin);
  geometry.setAttribute("aRippleArrival", new THREE.BufferAttribute(data, 1));
}

function applyArrivalToMesh(mesh: THREE.Mesh, arrivalByBuildingId: Map<number, number>): void {
  const geometry = mesh.geometry;
  const buildingId = mesh.userData.buildingId as number | undefined;
  const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
  const position = geometry.getAttribute("position");
  if (!position) return;

  if (buildingId !== undefined && buildingId >= 0) {
    const arrival = arrivalByBuildingId.get(buildingId) ?? 999;
    setArrivalAttribute(geometry, arrival);
    return;
  }

  if (byGroup?.length && geometry.groups?.length) {
    const data = new Float32Array(position.count);
    data.fill(999);
    geometry.groups.forEach((group, groupIndex) => {
      const id = byGroup[groupIndex];
      if (id === undefined || id < 0) return;
      const arrival = arrivalByBuildingId.get(id) ?? 999;
      for (let i = group.start; i < group.start + group.count; i++) data[i] = arrival;
    });
    geometry.setAttribute("aRippleArrival", new THREE.BufferAttribute(data, 1));
    return;
  }

  setArrivalAttribute(geometry, 999);
}

export class WalkRippleBuildingTint {
  readonly uniforms: RippleShaderUniforms = rippleColourUniforms();
  private saved = new Map<THREE.Mesh, SavedMaterial>();
  private attached = false;

  attach(root: THREE.Object3D, arrivalByBuildingId: Map<number, number>): void {
    this.detach();
    for (const mesh of buildingMeshes(root)) {
      this.saved.set(mesh, mesh.material);
      applyArrivalToMesh(mesh, arrivalByBuildingId);
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
  }
}
