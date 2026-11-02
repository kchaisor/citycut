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

function edgesForGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const edges = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
  const position = edges.getAttribute("position");
  if (!position || position.count < 2) {
    edges.dispose();
    return null;
  }
  return edges;
}

function geometryForGroup(
  source: THREE.BufferGeometry,
  group: { start: number; count: number },
): THREE.BufferGeometry | null {
  if (group.count <= 0) return null;
  const index = source.index;
  if (index) {
    const array = index.array;
    const slice = array.subarray(group.start, group.start + group.count);
    const nextIndex = new THREE.BufferAttribute(slice.slice(0), 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(nextIndex);
    for (const name of Object.keys(source.attributes)) {
      geometry.setAttribute(name, source.getAttribute(name));
    }
    return geometry;
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attr = source.getAttribute(name);
    const itemSize = attr.itemSize;
    const begin = group.start * itemSize;
    const end = (group.start + group.count) * itemSize;
    const slice = (attr.array as Float32Array).slice(begin, end);
    geometry.setAttribute(name, new THREE.BufferAttribute(slice, itemSize));
  }
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

function addEdgeLine(
  container: THREE.Group,
  edgeGeometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  buildingId: number,
): number {
  const position = edgeGeometry.getAttribute("position");
  if (!position || position.count < 2) {
    edgeGeometry.dispose();
    return 0;
  }
  const segments = position.count / 2;
  const material = new THREE.LineBasicMaterial({
    color,
    toneMapped: false,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(edgeGeometry, material);
  lines.name = "BuildingEdge";
  lines.userData.buildingId = buildingId;
  lines.renderOrder = SURFACE.building.renderOrder + 1;
  container.add(lines);
  return segments;
}

function edgeLinesForMesh(
  container: THREE.Group,
  mesh: THREE.Mesh,
  color: THREE.ColorRepresentation,
): number {
  const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
  const groups = mesh.geometry?.groups;
  if (byGroup?.length && groups?.length) {
    const groupCount = Math.min(byGroup.length, groups.length);
    const partsByBuilding = new Map<number, THREE.BufferGeometry[]>();
    for (let index = 0; index < groupCount; index++) {
      const buildingId = byGroup[index]!;
      const part = geometryForGroup(mesh.geometry, groups[index]!);
      if (!part) continue;
      const bucket = partsByBuilding.get(buildingId) ?? [];
      bucket.push(part);
      partsByBuilding.set(buildingId, bucket);
    }
    let segments = 0;
    for (const [buildingId, parts] of partsByBuilding) {
      let solid: THREE.BufferGeometry | null = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
      if (!solid) continue;
      if (parts.length > 1) {
        for (const part of parts) {
          if (part !== mesh.geometry) part.dispose();
        }
      }
      const edges = edgesForGeometry(solid);
      if (solid !== mesh.geometry) solid.dispose();
      if (edges) segments += addEdgeLine(container, edges, color, buildingId);
    }
    return segments;
  }
  const buildingId = Number(mesh.userData.buildingId ?? -1);
  const edges = edgesForGeometry(mesh.geometry);
  if (!edges) return 0;
  return addEdgeLine(container, edges, color, buildingId);
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
    const container = new THREE.Group();
    container.name = "BuildingEdges";
    container.userData.batch = batch.name;
    container.renderOrder = SURFACE.building.renderOrder + 1;
    for (const mesh of meshes) {
      pushFillBehindLines(mesh);
      segments += edgeLinesForMesh(container, mesh, edgeColorForBatch(batch.name));
    }
    if (container.children.length === 0) continue;
    batch.add(container);
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
