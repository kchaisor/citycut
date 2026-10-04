import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getColour } from "./colours";
import { matteStandardMaterial } from "./matteMaterial";
import type { TreeFeat } from "../types";

/**
 * Sphere crown layout in local metres (Y up).
 * The crown is a uniform sphere: diameter equals crown width.
 * Normally the top of the sphere sits at height_m.
 * When crown_diameter_m >= height_m, the sphere is clamped so its bottom is not below ground
 * (centre at crown_diameter_m / 2, top may sit below the nominal height).
 */
export function treeCrownSphereLayout(height_m: number, crown_diameter_m: number): {
  centerY: number;
  radius: number;
  scale: number;
} {
  const radius = Math.max(crown_diameter_m / 2, 0.05);
  let centerY = height_m - radius;
  if (height_m < crown_diameter_m) centerY = radius;
  return { centerY, radius, scale: crown_diameter_m };
}

function unitSphereGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 12, 10);
}

function unitTrunkGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Cylinder trunk plus one uniform sphere crown per tree. */
export function buildTreeGroup(
  trees: TreeFeat[],
  elevationAt: (east: number, north: number) => number = () => 0,
): THREE.Group | null {
  if (trees.length === 0) return null;
  const trunkColor = getColour("--tree-trunk");
  const crownColor = getColour("--tree-crown");
  const trunkMaterial = matteStandardMaterial({ color: trunkColor });
  const crownMaterial = matteStandardMaterial({ color: crownColor });

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
    const trunkHeight = Math.min(tree.height_m, layout.centerY + layout.radius * 0.35);

    position.set(tree.at[0], ground, -tree.at[1]);
    quaternion.identity();
    scale.set(trunkRadius, trunkHeight, trunkRadius);
    matrix.compose(position, quaternion, scale);
    const trunk = unitTrunkGeometry().clone();
    trunk.applyMatrix4(matrix);
    trunkGeometries.push(trunk);

    position.set(tree.at[0], ground + layout.centerY, -tree.at[1]);
    scale.set(layout.scale, layout.scale, layout.scale);
    matrix.compose(position, quaternion, scale);
    const crown = unitSphereGeometry().clone();
    crown.applyMatrix4(matrix);
    crownGeometries.push(crown);
  }

  const group = new THREE.Group();
  group.name = "Trees";
  const mergedTrunks = mergeGeometries(trunkGeometries, false);
  const mergedCrowns = mergeGeometries(crownGeometries, false);
  trunkGeometries.forEach((geometry) => geometry.dispose());
  crownGeometries.forEach((geometry) => geometry.dispose());
  if (mergedTrunks) group.add(new THREE.Mesh(mergedTrunks, trunkMaterial));
  if (mergedCrowns) group.add(new THREE.Mesh(mergedCrowns, crownMaterial));
  return group.children.length > 0 ? group : null;
}
