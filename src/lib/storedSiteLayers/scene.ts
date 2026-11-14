import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getColour } from "../colours";
import { matteStandardMaterial } from "../matteMaterial";
import { buildingViewportFill, type BuildingColourMode } from "../buildingViewportColor";
import { storedSiteAssetUrl } from "./registry";
import { storedSiteRelativeToScene } from "./transform";
import type { LonLat } from "../../types";
import { bridgePartRole, type BridgeBuildingMeta } from "./bridgePlan";
import type { StoredSiteLayerManifest, StoredSiteLayerState, StoredSiteMeshPart } from "./types";
import {
  DEFAULT_SITE_FRAME_SHAPE,
  frameGroundSize,
  pointInSiteFrame,
  type FrameGroundSize,
  type SiteFrameShape,
} from "../siteFrame";
import { refineStoredSiteContextPart, storedSitePartIsTerrainDrapeSurface } from "./storedSiteGroundMesh";
import type { WaterCutContext } from "../waterSurfaceCut";

export type { StoredSiteMeshPart } from "./types";

export function clipStoredSiteMeshPartToFrame(
  part: StoredSiteMeshPart,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): StoredSiteMeshPart | null {
  const triCount = part.indices.length / 3;
  const remap = new Map<number, number>();
  const outPos: number[] = [];
  const outIdx: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const ia = part.indices[t * 3]!;
    const ib = part.indices[t * 3 + 1]!;
    const ic = part.indices[t * 3 + 2]!;
    const inside = (index: number) => {
      const x = part.positions[index * 3]!;
      const z = part.positions[index * 3 + 2]!;
      return pointInSiteFrame([x, -z], sideM, shape, size);
    };
    if (!inside(ia) || !inside(ib) || !inside(ic)) continue;
    for (const old of [ia, ib, ic]) {
      let neu = remap.get(old);
      if (neu === undefined) {
        neu = outPos.length / 3;
        remap.set(old, neu);
        outPos.push(part.positions[old * 3]!, part.positions[old * 3 + 1]!, part.positions[old * 3 + 2]!);
      }
      outIdx.push(neu);
    }
  }
  if (outIdx.length < 3) return null;
  return {
    buildingId: part.buildingId,
    structure: part.structure,
    positions: new Float32Array(outPos),
    indices: new Uint32Array(outIdx),
  };
}

export function storedSiteMeshVerticesInsideFrame(
  part: StoredSiteMeshPart,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): boolean {
  const count = part.positions.length / 3;
  for (let i = 0; i < count; i++) {
    const x = part.positions[i * 3]!;
    const z = part.positions[i * 3 + 2]!;
    if (!pointInSiteFrame([x, -z], sideM, shape, size)) return false;
  }
  return true;
}

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
): StoredSiteMeshPart[] {
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
  const parts: StoredSiteMeshPart[] = [];
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

function splitBridgeMeshByMeta(
  geometry: THREE.BufferGeometry,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  buildingMeta: BridgeBuildingMeta[],
): StoredSiteMeshPart[] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position || !index) return [];
  const positions = remapPositions(position, manifest, origin, zone);
  const parts: StoredSiteMeshPart[] = [];
  for (const meta of buildingMeta) {
    const remap = new Map<number, number>();
    const outPos: number[] = [];
    const outIdx: number[] = [];
    for (let t = meta.indexStart / 3; t < (meta.indexStart + meta.indexCount) / 3; t++) {
      const ia = index.getX(t * 3)!;
      const ib = index.getX(t * 3 + 1)!;
      const ic = index.getX(t * 3 + 2)!;
      for (const old of [ia, ib, ic]) {
        let neu = remap.get(old);
        if (neu === undefined) {
          neu = outPos.length / 3;
          remap.set(old, neu);
          outPos.push(positions[old * 3]!, positions[old * 3 + 1]!, positions[old * 3 + 2]!);
        }
        outIdx.push(neu);
      }
    }
    if (outIdx.length < 3) continue;
    parts.push({
      positions: new Float32Array(outPos),
      indices: new Uint32Array(outIdx),
      buildingId: null,
      structure: true,
      partId: meta.id,
    });
  }
  return parts;
}

function storedSiteMeshToPart(
  geometry: THREE.BufferGeometry,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  structure: boolean,
): StoredSiteMeshPart | null {
  const position = geometry.getAttribute("position");
  if (!position) return null;
  const positions = remapPositions(position, manifest, origin, zone);
  const index = geometry.getIndex();
  const indices: number[] = [];
  if (index) {
    for (let i = 0; i < index.count; i++) indices.push(index.getX(i)!);
  } else {
    for (let i = 0; i < position.count; i++) indices.push(i);
  }
  if (indices.length < 3) return null;
  return {
    positions,
    indices: new Uint32Array(indices),
    buildingId: null,
    structure,
  };
}

async function loadGlbParts(
  url: string,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  layer: StoredSiteLayerState,
  structure: boolean,
  waterCut: WaterCutContext | null,
): Promise<{ parts: StoredSiteMeshPart[]; contextTrianglesKept: number }> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const rootIds =
    (gltf.scene.userData as { buildingIds?: string[] }).buildingIds ??
    (gltf.parser.json as { extras?: { buildingIds?: string[] } }).extras?.buildingIds ??
    [];
  const parts: StoredSiteMeshPart[] = [];
  let contextTrianglesKept = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BufferGeometry)) return;
    const meshName = mesh.name ?? "";
    if (meshName.startsWith("Buildings-Context")) {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      const whole = storedSiteMeshToPart(geometry, manifest, origin, zone, true);
      geometry.dispose();
      if (whole) {
        const refined = refineStoredSiteContextPart(whole, waterCut);
        contextTrianglesKept += refined.kept;
        if (refined.part) parts.push(refined.part);
      }
      return;
    }
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    (geometry.userData as { buildingIds?: string[] }).buildingIds = rootIds;
    parts.push(...splitMeshByBuildingId(geometry, manifest, origin, zone, layer, structure));
    geometry.dispose();
  });
  return { parts, contextTrianglesKept };
}

async function loadBridgeGlbParts(
  url: string,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
): Promise<StoredSiteMeshPart[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const mesh = gltf.scene.getObjectByName("Buildings-Bridge") as THREE.Mesh | undefined;
  if (!mesh?.geometry) return [];
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const json = gltf.parser.json as {
    meshes?: { primitives?: { extras?: { buildings?: BridgeBuildingMeta[] } }[] }[];
  };
  const buildingMeta = json.meshes?.[0]?.primitives?.[0]?.extras?.buildings ?? [];
  const parts = splitBridgeMeshByMeta(geometry, manifest, origin, zone, buildingMeta);
  geometry.dispose();
  return parts;
}

export async function buildStoredSiteLayerGroup(
  layer: StoredSiteLayerState,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  colourMode: BuildingColourMode,
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  waterCut: WaterCutContext | null = null,
): Promise<THREE.Group | null> {
  const buildingColour = buildingViewportFill(colourMode, "unclassified", "none");
  const structureColour = getColour("--stored-site-structure");
  const buildingMaterial = matteStandardMaterial({ color: buildingColour });
  buildingMaterial.name = "Buildings-stored-mesh";
  const structureMaterial = matteStandardMaterial({ color: structureColour });
  structureMaterial.name = "StoredSiteStructure";
  const { parts: buildingParts, contextTrianglesKept } = await loadGlbParts(
    storedSiteAssetUrl(layer.id, "buildings.glb"),
    manifest,
    origin,
    zone,
    layer,
    false,
    waterCut,
  );
  const bridgeParts = await loadBridgeGlbParts(
    storedSiteAssetUrl(layer.id, "anzac-bridge.glb"),
    manifest,
    origin,
    zone,
  );
  const bridgePlan = layer.bridgePlan;
  const frameSize = frameGroundSize(sideM);
  const allParts = [...buildingParts, ...bridgeParts]
    .map((part) => clipStoredSiteMeshPartToFrame(part, sideM, frameShape, frameSize))
    .filter((part): part is StoredSiteMeshPart => part != null)
    .filter((part) => !storedSitePartIsTerrainDrapeSurface(part))
    .filter((part) => {
      if (!part.partId || !bridgePlan) return true;
      const role = bridgePartRole(part.partId, bridgePlan);
      return role === "deck" || role === "pylon";
    });
  if (allParts.length === 0) return null;
  const group = new THREE.Group();
  group.name = "StoredSiteLayer";
  group.userData.rozelleContextTrianglesKept = contextTrianglesKept;
  for (const part of allParts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    const welded = mergeVertices(geometry, 0.08);
    geometry.dispose();
    welded.computeVertexNormals();
    const material = part.structure ? structureMaterial.clone() : buildingMaterial.clone();
    material.flatShading = true;
    const mesh = new THREE.Mesh(welded, material);
    mesh.name = part.structure ? "StoredSiteStructure" : "Buildings-stored-mesh";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (part.buildingId != null) mesh.userData.buildingId = part.buildingId;
    group.add(mesh);
  }
  return group;
}
