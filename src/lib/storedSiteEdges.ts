import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { drawingSheetColor } from "./drawingSheet";
import { SURFACE } from "./surfaceLayers";

export const STORED_SITE_EDGE_THRESHOLD_DEG = 30;
export const STORED_SITE_MIN_EDGE_M = 0.5;
export const STORED_SITE_MIN_ISLAND_M2 = 1;
const GROUND_NORMAL_MIN_Y = Math.cos((90 - 8) * (Math.PI / 180));

export type StoredSiteEdgeStats = {
  segments: number;
  ms: number;
};

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

function meshReliefM(mesh: THREE.Mesh): number {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return 0;
  return box.max.y - box.min.y;
}

function meshIsMostlyGround(mesh: THREE.Mesh): boolean {
  const normal = mesh.geometry.getAttribute("normal");
  if (!normal || normal.count < 3) return false;
  let groundLike = 0;
  for (let i = 0; i < normal.count; i++) {
    if (normal.getY(i)! >= GROUND_NORMAL_MIN_Y) groundLike++;
  }
  return groundLike / normal.count > 0.65;
}

function edgeLengthFromGeometry(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  let total = 0;
  for (let i = 0; i < position.count; i += 2) {
    const ax = position.getX(i)!;
    const ay = position.getY(i)!;
    const az = position.getZ(i)!;
    const bx = position.getX(i + 1)!;
    const by = position.getY(i + 1)!;
    const bz = position.getZ(i + 1)!;
    total += Math.hypot(bx - ax, by - ay, bz - az);
  }
  return total;
}

function filterShortEdges(geometry: THREE.BufferGeometry, minM: number): THREE.BufferGeometry | null {
  const position = geometry.getAttribute("position");
  if (!position || position.count < 2) return null;
  const out: number[] = [];
  for (let i = 0; i < position.count; i += 2) {
    const ax = position.getX(i)!;
    const ay = position.getY(i)!;
    const az = position.getZ(i)!;
    const bx = position.getX(i + 1)!;
    const by = position.getY(i + 1)!;
    const bz = position.getZ(i + 1)!;
    if (Math.hypot(bx - ax, by - ay, bz - az) < minM) continue;
    out.push(ax, ay, az, bx, by, bz);
  }
  if (out.length < 6) return null;
  const filtered = new THREE.BufferGeometry();
  filtered.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return filtered;
}

function edgesForStoredMesh(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  if (meshIsMostlyGround(mesh)) return null;
  const edges = new THREE.EdgesGeometry(mesh.geometry, STORED_SITE_EDGE_THRESHOLD_DEG);
  const filtered = filterShortEdges(edges, STORED_SITE_MIN_EDGE_M);
  edges.dispose();
  return filtered;
}

export function addStoredSiteEdges(root: THREE.Object3D): StoredSiteEdgeStats {
  const started = performance.now();
  const existing = root.getObjectByName("StoredSiteEdges");
  if (existing) {
    existing.removeFromParent();
    (existing as THREE.LineSegments).geometry?.dispose();
    const mat = (existing as THREE.LineSegments).material;
    if (mat instanceof THREE.Material) mat.dispose();
  }
  const parts: THREE.BufferGeometry[] = [];
  let segments = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name !== "Buildings-stored-mesh" && mesh.name !== "StoredSiteStructure") return;
    if (mesh.name === "Buildings-stored-mesh" && meshReliefM(mesh) < 1.2) return;
    forEachStandardMaterial(mesh, (material) => {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    });
    const edges = edgesForStoredMesh(mesh);
    if (!edges) return;
    const position = edges.getAttribute("position");
    if (!position) {
      edges.dispose();
      return;
    }
    const edgeLen = edgeLengthFromGeometry(edges);
    if (edgeLen < Math.sqrt(STORED_SITE_MIN_ISLAND_M2) * 4) {
      edges.dispose();
      return;
    }
    segments += position.count / 2;
    parts.push(edges);
  });
  if (parts.length === 0) {
    return { segments: 0, ms: performance.now() - started };
  }
  const merged = mergeGeometries(parts, false) ?? parts[0]!;
  for (const part of parts) {
    if (part !== merged) part.dispose();
  }
  const material = new THREE.LineBasicMaterial({
    color: drawingSheetColor("--building-edge"),
    toneMapped: false,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(merged, material);
  lines.name = "StoredSiteEdges";
  lines.renderOrder = SURFACE.building.renderOrder + 1;
  root.add(lines);
  root.userData.storedSiteEdges = { segments, ms: performance.now() - started };
  return { segments, ms: performance.now() - started };
}