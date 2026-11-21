import * as THREE from "three";
import { placedLocal, type ImportedMassing } from "./massingImport";
import { visibleMassingBuildings } from "./massingBuildings";
import type { LonLat } from "../types";

export function buildMassingGroup(imported: ImportedMassing[], origin: LonLat, zone: number): THREE.Group | null {
  const visible = visibleMassingBuildings(imported);
  if (visible.length === 0) return null;
  const group = new THREE.Group();
  group.name = "ImportedMassing";
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1a1916 });
  for (const { massing, building, part, colour } of visible) {
    const local = placedLocal(part, part.placement, origin, zone);
    const positions = new Float32Array(local.length);
    for (let i = 0; i < local.length; i += 3) {
      positions[i] = local[i]!;
      positions[i + 1] = local[i + 2]!;
      positions[i + 2] = -local[i + 1]!;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness: 0.85,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = building.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.importedMassingId = massing.id;
    mesh.userData.importedBuildingId = building.id;
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial);
    edges.userData.importedMassingId = massing.id;
    edges.userData.importedBuildingId = building.id;
    group.add(edges);
  }
  return group;
}
