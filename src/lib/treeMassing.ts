import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
  const unitCount = unitCrownGeometry().getAttribute("position").count;
  let bucketVertices = 0;
  let hasBucketCrowns = false;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.name === "TreeCrowns") {
      hasBucketCrowns = true;
      bucketVertices += mesh.geometry?.getAttribute("position")?.count ?? 0;
    }
  });
  if (hasBucketCrowns) return bucketVertices / unitCount;
  const crowns = group.children[group.children.length - 1] as THREE.Mesh | undefined;
  const vertices = crowns?.geometry?.getAttribute("position")?.count ?? 0;
  return vertices / unitCount;
}

function introTreeBucketIndex(tree: TreeFeat, sideM = 500, totalBuckets = 16): number {
  const dist = Math.hypot(tree.at[0], tree.at[1]);
  const maxDist = Math.max(1, sideM * 0.56);
  const seed = (tree.id | 0) ^ Math.round(tree.at[0] * 17) ^ Math.round(tree.at[1] * 31);
  const jitter = ((Math.imul(seed, 2654435761) >>> 0) % 1000) / 1000;
  const norm = Math.min(0.9999, Math.max(0, (dist / maxDist) * 0.68 + jitter * 0.32));
  return Math.floor(norm * totalBuckets);
}

function paintSolidVertexColors(geometry: THREE.BufferGeometry, fill: string) {
  const tint = new THREE.Color().setStyle(fill);
  const position = geometry.getAttribute("position");
  if (!position) return;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createTreeMaterials() {
  const trunkMaterial = matteStandardMaterial({ color: getColour("--tree-trunk") });
  trunkMaterial.name = "TreeTrunks";
  const crownMaterial = matteStandardMaterial({ color: 0xffffff, flatShading: true });
  crownMaterial.name = "TreeCrowns";
  crownMaterial.vertexColors = true;
  crownMaterial.flatShading = true;
  crownMaterial.needsUpdate = true;
  return { trunkMaterial, crownMaterial };
}

function crownGeometryForTree(
  tree: TreeFeat,
  elevationAt: (east: number, north: number) => number,
  crownBase: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  scale: THREE.Vector3,
): THREE.BufferGeometry {
  const ground = elevationAt(tree.at[0], tree.at[1]);
  const layout = treeCrownSphereLayout(tree.height_m, tree.crown_diameter_m);
  position.set(tree.at[0], ground + layout.centerY, -tree.at[1]);
  quaternion.identity();
  scale.set(layout.scaleX, layout.scaleY, layout.scaleZ);
  matrix.compose(position, quaternion, scale);
  const crown = crownBase.clone();
  crown.applyMatrix4(matrix);
  paintSolidVertexColors(crown, treeCrownColourForId(tree.id));
  return crown;
}

function trunkGeometryForTree(
  tree: TreeFeat,
  elevationAt: (east: number, north: number) => number,
  trunkBase: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  scale: THREE.Vector3,
): THREE.BufferGeometry {
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
  return trunk;
}

export function buildTreeGroup(
  trees: TreeFeat[],
  elevationAt: (east: number, north: number) => number = () => 0,
  options?: TreeGroupBuildOptions,
): THREE.Group | null {
  if (trees.length === 0) return null;
  const { trunkMaterial, crownMaterial } = createTreeMaterials();
  const trunkBase = unitTrunkGeometry();
  const crownBase = unitCrownGeometry();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  if (options?.introStagger) {
    const bucketTrunks = new Map<number, THREE.BufferGeometry[]>();
    const bucketCrowns = new Map<number, THREE.BufferGeometry[]>();
    const bucketMinGround = new Map<number, number>();
    for (const tree of trees) {
      const ground = elevationAt(tree.at[0], tree.at[1]);
      const b = introTreeBucketIndex(tree, options.sideM ?? 500, 16);
      const trunks = bucketTrunks.get(b) ?? [];
      trunks.push(trunkGeometryForTree(tree, elevationAt, trunkBase, matrix, position, quaternion, scale));
      bucketTrunks.set(b, trunks);
      const crowns = bucketCrowns.get(b) ?? [];
      crowns.push(crownGeometryForTree(tree, elevationAt, crownBase, matrix, position, quaternion, scale));
      bucketCrowns.set(b, crowns);
      const prevGround = bucketMinGround.get(b);
      if (prevGround === undefined || ground < prevGround) bucketMinGround.set(b, ground);
    }
    trunkBase.dispose();
    crownBase.dispose();

    const group = new THREE.Group();
    group.name = "Trees";
    const sortedBuckets = [...bucketTrunks.keys()].sort((a, b) => a - b);
    for (const b of sortedBuckets) {
      const tGeos = bucketTrunks.get(b) ?? [];
      const cGeos = bucketCrowns.get(b) ?? [];
      const mergedTrunks = mergeGeometries(tGeos, false);
      const mergedCrowns = mergeGeometries(cGeos, false);
      tGeos.forEach((geometry) => geometry.dispose());
      cGeos.forEach((geometry) => geometry.dispose());
      const sub = new THREE.Group();
      sub.name = "TreesBucket";
      sub.userData.introTreeBucket = b;
      sub.userData.introBaseY = bucketMinGround.get(b) ?? 0;
      if (mergedTrunks) {
        const tmMesh = new THREE.Mesh(mergedTrunks, trunkMaterial);
        tmMesh.name = "TreeTrunks";
        tmMesh.userData.exportLayer = "Trees";
        sub.add(tmMesh);
      }
      if (mergedCrowns) {
        mergedCrowns.computeVertexNormals();
        const cmMesh = new THREE.Mesh(mergedCrowns, crownMaterial);
        cmMesh.name = "TreeCrowns";
        cmMesh.userData.exportLayer = "Trees";
        sub.add(cmMesh);
      }
      if (sub.children.length > 0) group.add(sub);
    }
    return group.children.length > 0 ? group : null;
  }

  const trunkGeometries: THREE.BufferGeometry[] = [];
  const crownGeometries: THREE.BufferGeometry[] = [];
  for (const tree of trees) {
    trunkGeometries.push(trunkGeometryForTree(tree, elevationAt, trunkBase, matrix, position, quaternion, scale));
    crownGeometries.push(crownGeometryForTree(tree, elevationAt, crownBase, matrix, position, quaternion, scale));
  }
  trunkBase.dispose();
  crownBase.dispose();

  const group = new THREE.Group();
  group.name = "Trees";
  const mergedTrunks = mergeGeometries(trunkGeometries, false);
  const mergedCrowns = mergeGeometries(crownGeometries, false);
  trunkGeometries.forEach((geometry) => geometry.dispose());
  crownGeometries.forEach((geometry) => geometry.dispose());
  if (mergedTrunks) {
    const tmMesh = new THREE.Mesh(mergedTrunks, trunkMaterial);
    tmMesh.name = "TreeTrunks";
    tmMesh.userData.exportLayer = "Trees";
    group.add(tmMesh);
  }
  if (mergedCrowns) {
    mergedCrowns.computeVertexNormals();
    const cmMesh = new THREE.Mesh(mergedCrowns, crownMaterial);
    cmMesh.name = "TreeCrowns";
    cmMesh.userData.exportLayer = "Trees";
    group.add(cmMesh);
  }
  return group.children.length > 0 ? group : null;
}

export function countTreeCrownColourVariants(root: THREE.Object3D): number {
  const seen = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== "TreeCrowns") return;
    const attr = mesh.geometry?.getAttribute("color");
    if (!attr) return;
    const step = Math.max(1, Math.floor(attr.count / 512));
    for (let index = 0; index < attr.count; index += step) {
      const r = Math.round(attr.getX(index) * 255);
      const g = Math.round(attr.getY(index) * 255);
      const b = Math.round(attr.getZ(index) * 255);
      seen.add(`${r},${g},${b}`);
    }
  });
  return seen.size;
}
