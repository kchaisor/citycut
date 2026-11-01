import * as THREE from "three";
import { BUILDING_USE_META, buildingLayerName } from "./buildingUse";
import type { BuildingUse } from "../types";
import { getColour } from "./colours";
import {
  patchBuildingMaterialForSignalTrace,
  signalTraceBuildingUniforms,
  type SignalTraceBuildingUniforms,
} from "./signalTraceShader";

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

export class SignalTraceBuildingLook {
  readonly uniforms: SignalTraceBuildingUniforms = signalTraceBuildingUniforms();
  private saved = new Map<THREE.Mesh, SavedMaterial>();
  private attached = false;
  private sourceBuildingId: number | null = null;

  private setSourceAttribute(mesh: THREE.Mesh, sourceBuildingId: number | null): void {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const data = new Float32Array(position.count);
    const meshId = mesh.userData.buildingId as number | undefined;
    const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
    if (sourceBuildingId !== null && meshId === sourceBuildingId) {
      data.fill(1);
    } else if (sourceBuildingId !== null && byGroup?.length && geometry.groups?.length) {
      geometry.groups.forEach((group, groupIndex) => {
        const bid = byGroup[groupIndex];
        const glow = bid === sourceBuildingId ? 1 : 0;
        for (let i = group.start; i < group.start + group.count; i++) data[i] = glow;
      });
    }
    geometry.setAttribute("aSourceGlow", new THREE.BufferAttribute(data, 1));
  }

  attach(root: THREE.Object3D): void {
    this.detach();
    for (const mesh of buildingMeshes(root)) {
      this.saved.set(mesh, mesh.material);
      this.setSourceAttribute(mesh, null);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = materials.map((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
        const clone = mat.clone();
        patchBuildingMaterialForSignalTrace(clone, this.uniforms);
        return clone;
      });
      mesh.material = next.length === 1 ? next[0]! : next;
    }
    this.attached = true;
    this.setSourceBuildingId(this.sourceBuildingId, root);
  }

  detach(): void {
    if (!this.attached) return;
    for (const [mesh, material] of this.saved) {
      mesh.material = material;
    }
    for (const mesh of this.saved.keys()) {
      const attr = mesh.geometry.getAttribute("aSourceGlow");
      if (attr) mesh.geometry.deleteAttribute("aSourceGlow");
    }
    this.saved.clear();
    this.sourceBuildingId = null;
    this.attached = false;
  }

  setSourceBuildingId(buildingId: number | null, root: THREE.Object3D): void {
    this.sourceBuildingId = buildingId;
    if (!this.attached && buildingId !== null) this.attach(root);
    if (!this.attached) return;
    for (const mesh of buildingMeshes(root)) {
      this.setSourceAttribute(mesh, buildingId);
    }
  }

  refreshColours(): void {
    this.uniforms.uGlassFill.value.setStyle(getColour("--signal-trace-building-fill"));
    this.uniforms.uGlassEdge.value.setStyle(getColour("--signal-trace-building-rim"));
    this.uniforms.uSourceFill.value.setStyle(getColour("--signal-trace-source-glow"));
  }
}
