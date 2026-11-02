import * as THREE from "three";
import { getColour } from "./colours";
import { matteStandardMaterial } from "./matteMaterial";
import type { TreeFeat } from "../types";
import { treeCrownColourForId } from "./treeCrownVariants";

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

export type TreeGroupBuildOptions = {
  introStagger?: boolean;
  sideM?: number;
};

export function countTreeCrowns(root: THREE.Object3D): number {
  const group = root.getObjectByName("Trees");
  if (!group) return 0;
  let total = 0;
  group.traverse((object) => {
    const instanced = object as THREE.InstancedMesh;
    if (instanced.isInstancedMesh && instanced.name === "TreeCrowns") total += instanced.count;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.name === "TreeCrowns" && !instanced.isInstancedMesh) {
      const unitCount = unitCrownGeometry().getAttribute("position").count;
      total += (mesh.geometry?.getAttribute("position")?.count ?? 0) / unitCount;
    }
  });
  return total;
}

function introTreeBucketIndex(tree: TreeFeat, sideM = 500, totalBuckets = 16): number {
  const dist = Math.hypot(tree.at[0], tree.at[1]);
  const maxDist = Math.max(1, sideM * 0.56);
  const seed = (tree.id | 0) ^ Math.round(tree.at[0] * 17) ^ Math.round(tree.at[1] * 31);
  const jitter = ((Math.imul(seed, 2654435761) >>> 0) % 1000) / 1000;
  const norm = Math.min(0.9999, Math.max(0, (dist / maxDist) * 0.68 + jitter * 0.32));
  return Math.floor(norm * totalBuckets);
}

function createTreeMaterials() {
  const trunkColor = getColour("--tree-trunk");
  const trunkMaterial = matteStandardMaterial({ color: trunkColor });
  trunkMaterial.name = "TreeTrunks";
  const crownMaterial = matteStandardMaterial({ color: 0xffffff, flatShading: true });
  crownMaterial.name = "TreeCrowns";
  crownMaterial.vertexColors = true;
  crownMaterial.flatShading = true;
  crownMaterial.needsUpdate = true;
  return { trunkMaterial, crownMaterial };
}

function fillTreeInstances(
  trees: TreeFeat[],
  elevationAt: (east: number, north: number) => number,
  crownMesh: THREE.InstancedMesh,
  trunkMesh: THREE.InstancedMesh,
) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < trees.length; index++) {
    const tree = trees[index]!;
    const ground = elevationAt(tree.at[0], tree.at[1]);
    const layout = treeCrownSphereLayout(tree.height_m, tree.crown_diameter_m);
    const trunkRadius = Math.max(tree.trunk_diameter_m / 2, 0.04);
    const trunkHeight = Math.max(0.4, Math.min(tree.height_m, layout.centerY + layout.radiusY * 0.35));

    position.set(tree.at[0], ground, -tree.at[1]);
    quaternion.identity();
    scale.set(trunkRadius, trunkHeight, trunkRadius);
    matrix.compose(position, quaternion, scale);
    trunkMesh.setMatrixAt(index, matrix);

    position.set(tree.at[0], ground + layout.centerY, -tree.at[1]);
    scale.set(layout.scaleX, layout.scaleY, layout.scaleZ);
    matrix.compose(position, quaternion, scale);
    crownMesh.setMatrixAt(index, matrix);
    color.setStyle(treeCrownColourForId(tree.id));
    crownMesh.setColorAt(index, color);
  }
  crownMesh.instanceMatrix.needsUpdate = true;
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
}

function instancedPair(
  count: number,
  crownUnit: THREE.BufferGeometry,
  trunkUnit: THREE.BufferGeometry,
  materials: ReturnType<typeof createTreeMaterials>,
) {
  const crownGeometry = crownUnit.clone();
  const trunkGeometry = trunkUnit.clone();
  const crownMesh = new THREE.InstancedMesh(crownGeometry, materials.crownMaterial, count);
  crownMesh.name = "TreeCrowns";
  crownMesh.userData.exportLayer = "Trees";
  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, materials.trunkMaterial, count);
  trunkMesh.name = "TreeTrunks";
  trunkMesh.userData.exportLayer = "Trees";
  return { crownMesh, trunkMesh };
}

export function buildTreeGroup(
  trees: TreeFeat[],
  elevationAt: (east: number, north: number) => number = () => 0,
  options?: TreeGroupBuildOptions,
): THREE.Group | null {
  if (trees.length === 0) return null;
  const materials = createTreeMaterials();
  const trunkBase = unitTrunkGeometry();
  const crownBase = unitCrownGeometry();

  if (options?.introStagger) {
    const buckets = new Map<number, TreeFeat[]>();
    const bucketMinGround = new Map<number, number>();
    for (const tree of trees) {
      const b = introTreeBucketIndex(tree, options.sideM ?? 500, 16);
      const list = buckets.get(b);
      if (list) list.push(tree);
      else buckets.set(b, [tree]);
      const ground = elevationAt(tree.at[0], tree.at[1]);
      const prev = bucketMinGround.get(b);
      if (prev === undefined || ground < prev) bucketMinGround.set(b, ground);
    }
    const group = new THREE.Group();
    group.name = "Trees";
    const sortedBuckets = [...buckets.keys()].sort((a, b) => a - b);
    for (const b of sortedBuckets) {
      const bucketTrees = buckets.get(b) ?? [];
      if (bucketTrees.length === 0) continue;
      const { crownMesh, trunkMesh } = instancedPair(bucketTrees.length, crownBase, trunkBase, materials);
      fillTreeInstances(bucketTrees, elevationAt, crownMesh, trunkMesh);
      const sub = new THREE.Group();
      sub.name = "TreesBucket";
      sub.userData.introTreeBucket = b;
      sub.userData.introBaseY = bucketMinGround.get(b) ?? 0;
      sub.add(trunkMesh);
      sub.add(crownMesh);
      group.add(sub);
    }
    crownBase.dispose();
    trunkBase.dispose();
    return group.children.length > 0 ? group : null;
  }

  const { crownMesh, trunkMesh } = instancedPair(trees.length, crownBase, trunkBase, materials);
  fillTreeInstances(trees, elevationAt, crownMesh, trunkMesh);
  crownBase.dispose();
  trunkBase.dispose();

  const group = new THREE.Group();
  group.name = "Trees";
  group.add(trunkMesh);
  group.add(crownMesh);
  return group;
}

export function countTreeCrownColourVariants(root: THREE.Object3D): number {
  const seen = new Set<string>();
  const color = new THREE.Color();
  root.traverse((object) => {
    const instanced = object as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh || instanced.name !== "TreeCrowns" || !instanced.instanceColor) return;
    for (let index = 0; index < instanced.count; index++) {
      instanced.getColorAt(index, color);
      seen.add(color.getHexString());
    }
  });
  return seen.size;
}
