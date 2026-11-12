import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getColour } from "../colours";
import { matteStandardMaterial } from "../matteMaterial";
import { buildingViewportFill, type BuildingColourMode } from "../buildingViewportColor";
import { storedSiteAssetUrl } from "./registry";
import { storedSiteRelativeToScene } from "./transform";
import type { LonLat } from "../../types";
import type { StoredSiteLayerManifest, StoredSiteLayerState } from "./types";

type LoadedMeshPart = {
  positions: Float32Array;
  indices: Uint32Array;
  buildingId: number | null;
  structure: boolean;
};

function remapPositions(
  array: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
): Float32Array {
  const out = new Float32Array(array.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < array.count; i++) {
    v.fromBufferAttribute(array as THREE.BufferAttribute, i);
    const [x, y, z] = storedSiteRelativeToScene(v.x, v.y, v.z, manifest, origin, zone);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

function splitMeshByBuildingId(
  geometry: THREE.BufferGeometry,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  layer: StoredSiteLayerState,
  structure: boolean,
): LoadedMeshPart[] {
  const position = geometry.getAttribute("position");
  if (!position) return [];
  const positions = remapPositions(position, manifest, origin, zone);
  const index = geometry.getIndex();
  const idAttr = geometry.getAttribute("_BUILDING_ID") as THREE.BufferAttribute | undefined;
  const buildingIds = (geometry.userData as { buildingIds?: string[] }).buildingIds;
  const triCount = index ? index.count / 3 : position.count / 3;
  const buckets = new Map<number | "structure", number[]>();
  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3)! : t * 3;
    const ib = index ? index.getX(t * 3 + 1)! : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2)! : t * 3 + 2;
    let numericId: number | null = null;
    if (structure) numericId = null;
    else if (idAttr) {
      const raw = idAttr.getX(ia);
      const meshKey = buildingIds?.[raw];
      if (meshKey) numericId = layer.buildingIdByMeshKey[meshKey] ?? null;
    }
    const key = numericId ?? ("structure" as const);
    const list = buckets.get(key) ?? [];
    list.push(ia, ib, ic);
    buckets.set(key, list);
  }
  const parts: LoadedMeshPart[] = [];
  for (const [key, flat] of buckets) {
    if (flat.length < 3) continue;
    const remap = new Map<number, number>();
    const outPos: number[] = [];
    const outIdx: number[] = [];
    for (let i = 0; i < flat.length; i++) {
      const old = flat[i]!;
      let neu = remap.get(old);
      if (neu === undefined) {
        neu = outPos.length / 3;
        remap.set(old, neu);
        outPos.push(positions[old * 3]!, positions[old * 3 + 1]!, positions[old * 3 + 2]!);
      }
      outIdx.push(neu);
    }
    parts.push({
      positions: new Float32Array(outPos),
      indices: new Uint32Array(outIdx),
      buildingId: key === "structure" ? null : key,
      structure: key === "structure",
    });
  }
  return parts;
}

async function loadGlbParts(
  url: string,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  layer: StoredSiteLayerState,
  structure: boolean,
): Promise<LoadedMeshPart[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const rootIds =
    (gltf.scene.userData as { buildingIds?: string[] }).buildingIds ??
    (gltf.parser.json as { extras?: { buildingIds?: string[] } }).extras?.buildingIds ??
    [];
  const parts: LoadedMeshPart[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BufferGeometry)) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    (geometry.userData as { buildingIds?: string[] }).buildingIds = rootIds;
    parts.push(...splitMeshByBuildingId(geometry, manifest, origin, zone, layer, structure));
    geometry.dispose();
  });
  return parts;
}

export async function buildStoredSiteLayerGroup(
  layer: StoredSiteLayerState,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  colourMode: BuildingColourMode,
  sideM: number,
): Promise<THREE.Group | null> {
  const buildingColour = buildingViewportFill(colourMode, "unclassified", "none");
  const structureColour = getColour("--stored-site-structure");
  const buildingMaterial = matteStandardMaterial({ color: buildingColour });
  buildingMaterial.name = "Buildings-stored-mesh";
  const structureMaterial = matteStandardMaterial({ color: structureColour });
  structureMaterial.name = "StoredSiteStructure";
  const buildingParts = await loadGlbParts(
    storedSiteAssetUrl(layer.id, "buildings.glb"),
    manifest,
    origin,
    zone,
    layer,
    false,
  );
  const bridgeParts = await loadGlbParts(
    storedSiteAssetUrl(layer.id, "anzac-bridge.glb"),
    manifest,
    origin,
    zone,
    layer,
    true,
  );
  const half = sideM / 2;
  const allParts = [...buildingParts, ...bridgeParts].filter((part) => {
    const count = part.positions.length / 3;
    for (let i = 0; i < count; i++) {
      const x = part.positions[i * 3]!;
      const z = part.positions[i * 3 + 2]!;
      if (Math.abs(x) <= half + 2 && Math.abs(z) <= half + 2) return true;
    }
    return false;
  });
  if (allParts.length === 0) return null;
  const group = new THREE.Group();
  group.name = "StoredSiteLayer";
  for (const part of allParts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.computeVertexNormals();
    const material = part.structure ? structureMaterial.clone() : buildingMaterial.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.structure ? "StoredSiteStructure" : "Buildings-stored-mesh";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (part.buildingId != null) mesh.userData.buildingId = part.buildingId;
    group.add(mesh);
  }
  return group;
}
