import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { BUILDING_EDGE_COLOR, BUILDING_EDGE_THRESHOLD_DEG } from "./buildingEdges";
import { placedLocal, type ImportedMassing } from "./massingImport";
import { visibleMassingBuildings } from "./massingBuildings";
import type { LonLat } from "../types";

export const IMPORTED_EDGE_PX = 1.5;

const rendererSize = new THREE.Vector2();

function massingOutline(geometry: THREE.BufferGeometry, material: LineMaterial, name: string): LineSegments2 {
  const edges = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
  const outline = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(edges), material);
  edges.dispose();
  outline.name = `${name} outline`;
  outline.raycast = () => {};
  outline.onBeforeRender = (renderer) => {
    renderer.getSize(rendererSize);
    material.resolution.set(rendererSize.x, rendererSize.y);
  };
  return outline;
}

export function buildMassingGroup(imported: ImportedMassing[], origin: LonLat, zone: number): THREE.Group | null {
  const visible = visibleMassingBuildings(imported);
  if (visible.length === 0) return null;
  const group = new THREE.Group();
  group.name = "ImportedMassing";
  const edgeMaterial = new LineMaterial({ color: BUILDING_EDGE_COLOR, linewidth: IMPORTED_EDGE_PX, toneMapped: false });
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
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = building.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.importedMassingId = massing.id;
    mesh.userData.importedBuildingId = building.id;
    group.add(mesh);
    group.add(massingOutline(geometry, edgeMaterial, building.name));
  }
  return group;
}
