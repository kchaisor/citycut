import * as THREE from "three";
import { placedLocal, type ImportedMassing } from "./massingImport";
import { getColour } from "./colours";
import type { LonLat } from "../types";

/** Imported massing as three meshes in the CityModel frame (x east, y up, z = −north). */
export function buildMassingGroup(imported: ImportedMassing[], origin: LonLat, zone: number): THREE.Group | null {
  const visible = imported.filter((item) => item.visible);
  if (visible.length === 0) return null;
  const group = new THREE.Group();
  group.name = "ImportedMassing";
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1a1916 });
  for (const item of visible) {
    const local = placedLocal(item, item.placement, origin, zone);
    const positions = new Float32Array(local.length);
    for (let i = 0; i < local.length; i += 3) {
      positions[i] = local[i]!;
      positions[i + 1] = local[i + 2]!;
      positions[i + 2] = -local[i + 1]!;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(item.indices, 1));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(item.colour ?? getColour("--imported-massing")),
      roughness: 0.85,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.importedMassingId = item.id;
    group.add(mesh);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial));
  }
  return group;
}
