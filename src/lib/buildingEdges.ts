import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getColour } from "./colours";
import { drawingSheetColor } from "./drawingSheet";
import { SURFACE } from "./surfaceLayers";

export const BUILDING_EDGE_THRESHOLD_DEG = 25;

export const BUILDING_EDGE_COLOR = drawingSheetColor("--building-edge");

const FILL_OFFSET_FACTOR = 1;
const FILL_OFFSET_UNITS = 1;

export type BuildingEdgeStats = {
  batches: number;
  segments: number;
  ms: number;
};

function isBuildingBatch(name: string): boolean {
  return (
    name === "Buildings" ||
    name === "Buildings-site" ||
    name.startsWith("Buildings::") ||
    name.startsWith("source:")
  );
}

function edgeColorForBatch(batchName: string): THREE.ColorRepresentation {
  if (batchName === "Buildings-site" || batchName === "Buildings::Site") {
    return getColour("--site-building-edge");
  }
  return BUILDING_EDGE_COLOR;
}

function edgesForMesh(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  const edges = new THREE.EdgesGeometry(mesh.geometry, BUILDING_EDGE_THRESHOLD_DEG);
  const position = edges.getAttribute("position");
  if (!position || position.count < 2) {
    edges.dispose();
    return null;
  }
  return edges;
}

function mergeEdgeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  if (merged) {
    for (const part of parts) part.dispose();
    return merged;
  }
  let count = 0;
  for (const part of parts) count += part.getAttribute("position").count;
  const array = new Float32Array(count * 3);
  let offset = 0;
  for (const part of parts) {
    const attribute = part.getAttribute("position");
    array.set(attribute.array as ArrayLike<number>, offset);
    offset += attribute.array.length;
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(array, 3));
  return geometry;
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function pushFillBehindLines(mesh: THREE.Mesh) {
  for (const material of materialsOf(mesh)) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = FILL_OFFSET_FACTOR;
    material.polygonOffsetUnits = FILL_OFFSET_UNITS;
  }
}

function keepGroundGap(root: THREE.Object3D) {
  const deltaFactor = FILL_OFFSET_FACTOR - SURFACE.building.polygonOffsetFactor;
  const deltaUnits = FILL_OFFSET_UNITS - SURFACE.building.polygonOffsetUnits;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name !== "Terrain" && mesh.name !== "Ground") return;
    for (const material of materialsOf(mesh)) {
      if (!material.polygonOffset) continue;
      material.polygonOffsetFactor += deltaFactor;
      material.polygonOffsetUnits += deltaUnits;
    }
  });
}

export function addBuildingEdges(root: THREE.Object3D): BuildingEdgeStats {
  const started = performance.now();
  const batches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (!isBuildingBatch(object.name)) return;
    if (object.parent && isBuildingBatch(object.parent.name)) return;
    batches.push(object);
  });

  let segments = 0;
  let drawn = 0;
  for (const batch of batches) {
    const meshes: THREE.Mesh[] = [];
    batch.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    const parts: THREE.BufferGeometry[] = [];
    for (const mesh of meshes) {
      pushFillBehindLines(mesh);
      const edges = edgesForMesh(mesh);
      if (edges) parts.push(edges);
    }
    const geometry = mergeEdgeGeometries(parts);
    if (!geometry) continue;
    const position = geometry.getAttribute("position");
    segments += position.count / 2;
    const material = new THREE.LineBasicMaterial({
      color: edgeColorForBatch(batch.name),
      toneMapped: false,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = "BuildingEdges";
    lines.userData.batch = batch.name;
    lines.renderOrder = SURFACE.building.renderOrder + 1;
    batch.add(lines);
    drawn += 1;
  }

  if (drawn > 0) keepGroundGap(root);

  const stats: BuildingEdgeStats = {
    batches: drawn,
    segments,
    ms: performance.now() - started,
  };
  root.userData.buildingEdges = stats;
  return stats;
}
