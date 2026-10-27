import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getColour } from "./colours";
import { matteStandardMaterial } from "./matteMaterial";
import type { TreeFeat } from "../types";

/**
 * Low-poly geodesic ellipsoid crown layout in local metres (Y up).
 * Horizontal diameter (X/Z) equals crown_diameter_m (clamped to >= 1 m).
 * Vertical height (Y) is 72% of tree height_m (clamped to >= 1.2 m), leaving ~28% clear trunk below.
 * The top of the crown sits at height_m (clamped so the bottom never pokes below ground).
 */
export function treeCrownSphereLayout(height_m: number, crown_diameter_m: number): {
  centerY: number;
  radius: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  radiusX: number;
  radiusY: number;
} {
  const scaleX = Math.max(crown_diameter_m, 1);
  const scaleZ = scaleX;
  const scaleY = Math.max(1.2, height_m * 0.72);
  const radiusX = scaleX / 2;
  const radiusY = scaleY / 2;
  const centerY = Math.max(radiusY, height_m - radiusY);
  return {
    centerY,
    radius: radiusY,
    scale: scaleX,
    scaleX,
    scaleY,
    scaleZ,
    radiusX,
    radiusY,
  };
}

function unitCrownGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function unitTrunkGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Trees drawn in a built scene: the merged crown mesh holds one unit geodesic crown per tree (QA readout). */
export function countTreeCrowns(root: THREE.Object3D): number {
  const group = root.getObjectByName("Trees");
  const crowns = group?.children[group.children.length - 1] as THREE.Mesh | undefined;
  const vertices = crowns?.geometry?.getAttribute("position")?.count ?? 0;
  return vertices / unitCrownGeometry().getAttribute("position").count;
}

/** Cylinder trunk plus one low-poly faceted geodesic ellipsoid crown per tree. */
export function buildTreeGroup(
  trees: TreeFeat[],
  elevationAt: (east: number, north: number) => number = () => 0,
): THREE.Group | null {
  if (trees.length === 0) return null;
  const trunkColor = getColour("--tree-trunk");
  const crownColor = getColour("--tree-crown");
  const trunkMaterial = matteStandardMaterial({ color: trunkColor });
  const crownMaterial = matteStandardMaterial({ color: crownColor, flatShading: true });
  crownMaterial.flatShading = true;
  crownMaterial.needsUpdate = true;

  const trunkBase = unitTrunkGeometry();
  const crownBase = unitCrownGeometry();
  const trunkGeometries: THREE.BufferGeometry[] = [];
  const crownGeometries: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const tree of trees) {
    const ground = elevationAt(tree.at[0], tree.at[1]);
    const layout = treeCrownSphereLayout(tree.height_m, tree.crown_diameter_m);
    const trunkRadius = Math.max(tree.trunk_diameter_m / 2, 0.04);
    const trunkHeight = Math.max(0.4, Math.min(tree.height_m, layout.centerY + layout.radiusY * 0.35));

    position.set(tree.at[0], ground, -tree.at[1]);
    quaternion.identity();
    scale.set(trunkRadius, trunkHeight, trunkRadius);
    matrix.compose(position, quaternion, scale);
    const trunk = trunkBase.clone();
    trunk.applyMatrix4(matrix);
    trunkGeometries.push(trunk);

    position.set(tree.at[0], ground + layout.centerY, -tree.at[1]);
    scale.set(layout.scaleX, layout.scaleY, layout.scaleZ);
    matrix.compose(position, quaternion, scale);
    const crown = crownBase.clone();
    crown.applyMatrix4(matrix);
    crownGeometries.push(crown);
  }
  trunkBase.dispose();
  crownBase.dispose();

  const group = new THREE.Group();
  group.name = "Trees";
  const mergedTrunks = mergeGeometries(trunkGeometries, false);
  const mergedCrowns = mergeGeometries(crownGeometries, false);
  trunkGeometries.forEach((geometry) => geometry.dispose());
  crownGeometries.forEach((geometry) => geometry.dispose());
  if (mergedTrunks) group.add(new THREE.Mesh(mergedTrunks, trunkMaterial));
  if (mergedCrowns) {
    mergedCrowns.computeVertexNormals();
    group.add(new THREE.Mesh(mergedCrowns, crownMaterial));
  }
  return group.children.length > 0 ? group : null;
}
