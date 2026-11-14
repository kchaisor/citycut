import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Pt, Ring } from "../../types";
import type { LonLat } from "../../types";
import {
  clipPolylineSiteFrame,
  DEFAULT_SITE_FRAME_SHAPE,
  frameGroundSize,
  pointInSiteFrame,
  type FrameGroundSize,
  type SiteFrameShape,
} from "../siteFrame";
import { deckPlanStrokePaths } from "./structurePlan";
import { storedSiteRelativeToScene } from "./transform";
import type { StoredSiteLayerManifest } from "./types";

export const BRIDGE_STAY_3D_MAX_M = 85;

export const BRIDGE_DECK_PART_ID = "anzac-bridge-057";

export type BridgeBuildingMeta = {
  id: string;
  vertexStart: number;
  vertexCount: number;
  indexStart: number;
  indexCount: number;
};

export type StoredSiteBridgePlan = {
  version: 1;
  deckPartId: string;
  cablePartIds: string[];
  stayPartIds: string[];
  pylonPartIds: string[];
  pylonFootprints: Ring[];
  cableLines: Pt[][];
  stayLines3d: Pt[][];
};

export function deckRoadOutlines(ring: Ring): Pt[][] {
  const strokes = deckPlanStrokePaths(ring);
  const rails = strokes.filter((stroke) => stroke.kind === "rail").map((stroke) => stroke.line);
  if (rails.length > 0) return rails;
  return strokes.map((stroke) => stroke.line);
}

function partEastNorthStats(
  positions: Float32Array,
  indices: Uint32Array,
  meta: BridgeBuildingMeta,
): { minE: number; minN: number; maxE: number; maxN: number; meanAhd: number } {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  let ahdSum = 0;
  let count = 0;
  const seen = new Set<number>();
  for (let t = meta.indexStart / 3; t < (meta.indexStart + meta.indexCount) / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = indices[t * 3 + k]!;
      if (seen.has(vi)) continue;
      seen.add(vi);
      const east = positions[vi * 3]!;
      const ahd = positions[vi * 3 + 1]!;
      const north = -positions[vi * 3 + 2]!;
      minE = Math.min(minE, east);
      maxE = Math.max(maxE, east);
      minN = Math.min(minN, north);
      maxN = Math.max(maxN, north);
      ahdSum += ahd;
      count++;
    }
  }
  return {
    minE,
    minN,
    maxE,
    maxN,
    meanAhd: count > 0 ? ahdSum / count : 0,
  };
}

function classifyBridgePart(stats: {
  wE: number;
  wN: number;
  span: number;
  id: string;
}): "deck" | "pylon" | "stay" | "cablePlane" {
  if (stats.id === BRIDGE_DECK_PART_ID) return "deck";
  const minSide = Math.min(stats.wE, stats.wN);
  const maxSide = Math.max(stats.wE, stats.wN);
  const aspect = maxSide / Math.max(0.05, minSide);
  if (aspect >= 8 && maxSide >= 20) return "stay";
  if (aspect < 2.35 && stats.span >= 12 && stats.span <= 32) return "pylon";
  if (aspect >= 3 && stats.wE * stats.wN >= 80) return "cablePlane";
  return "cablePlane";
}

function clipBridgeLines(
  lines: Pt[][],
  sideM: number,
  frameShape: SiteFrameShape,
  frameSize: FrameGroundSize,
): Pt[][] {
  const out: Pt[][] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    for (const part of clipPolylineSiteFrame(line, sideM, frameShape, frameSize)) {
      if (part.length < 2) continue;
      const a = part[0]!;
      const b = part[part.length - 1]!;
      if (!pointInSiteFrame(a, sideM, frameShape, frameSize) || !pointInSiteFrame(b, sideM, frameShape, frameSize)) {
        continue;
      }
      out.push(part);
    }
  }
  return out;
}

function aabbRing(minE: number, minN: number, maxE: number, maxN: number): Ring {
  return [
    [minE, minN],
    [maxE, minN],
    [maxE, maxN],
    [minE, maxN],
    [minE, minN],
  ];
}

function cableCenterline(positions: Float32Array, indices: Uint32Array, meta: BridgeBuildingMeta): Pt[] | null {
  const points: Pt[] = [];
  const seen = new Set<number>();
  for (let t = meta.indexStart / 3; t < (meta.indexStart + meta.indexCount) / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = indices[t * 3 + k]!;
      if (seen.has(vi)) continue;
      seen.add(vi);
      points.push([positions[vi * 3]!, -positions[vi * 3 + 2]!]);
    }
  }
  if (points.length < 2) return null;
  let bestI = 0;
  let bestJ = 1;
  let bestD = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[j]![0] - points[i]![0], points[j]![1] - points[i]![1]);
      if (d > bestD) {
        bestD = d;
        bestI = i;
        bestJ = j;
      }
    }
  }
  if (bestD < 4) return null;
  return [points[bestI]!, points[bestJ]!];
}

export function buildBridgePlanFromBridgeGlb(
  geometry: THREE.BufferGeometry,
  buildingMeta: BridgeBuildingMeta[],
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  frameSize?: FrameGroundSize,
): StoredSiteBridgePlan {
  const ground = frameSize ?? frameGroundSize(sideM);
  const positions = geometry.getAttribute("position");
  if (!positions || !geometry.index) {
    return {
      version: 1,
      deckPartId: BRIDGE_DECK_PART_ID,
      cablePartIds: [],
      stayPartIds: [],
      pylonPartIds: [],
      pylonFootprints: [],
      cableLines: [],
      stayLines3d: [],
    };
  }
  const scenePos = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    scenePos[i * 3] = positions.getX(i)!;
    scenePos[i * 3 + 1] = positions.getY(i)!;
    scenePos[i * 3 + 2] = positions.getZ(i)!;
  }
  const indices = geometry.index.array as Uint32Array;
  const cablePartIds: string[] = [];
  const stayPartIds: string[] = [];
  const pylonPartIds: string[] = [];
  const pylonFootprints: Ring[] = [];
  const cableLines: Pt[][] = [];
  const stayLines3d: Pt[][] = [];
  for (const meta of buildingMeta) {
    const stats = partEastNorthStats(scenePos, indices, meta);
    const wE = stats.maxE - stats.minE;
    const wN = stats.maxN - stats.minN;
    const span = Math.hypot(wE, wN);
    const role = classifyBridgePart({ wE, wN, span, id: meta.id });
    if (role === "deck") continue;
    if (role === "pylon") {
      pylonPartIds.push(meta.id);
      pylonFootprints.push(aabbRing(stats.minE, stats.minN, stats.maxE, stats.maxN));
      continue;
    }
    const line = cableCenterline(scenePos, indices, meta);
    if (!line) continue;
    if (role === "stay") {
      stayPartIds.push(meta.id);
      const len = Math.hypot(line[1]![0] - line[0]![0], line[1]![1] - line[0]![1]);
      if (len <= BRIDGE_STAY_3D_MAX_M) stayLines3d.push(line);
      continue;
    }
    cablePartIds.push(meta.id);
    cableLines.push(line);
  }
  return {
    version: 1,
    deckPartId: BRIDGE_DECK_PART_ID,
    cablePartIds,
    stayPartIds,
    pylonPartIds,
    pylonFootprints,
    cableLines: clipBridgeLines(cableLines, sideM, frameShape, ground),
    stayLines3d: clipBridgeLines(stayLines3d, sideM, frameShape, ground),
  };
}

export function parseStoredSiteBridgePlan(raw: unknown): StoredSiteBridgePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as StoredSiteBridgePlan;
  if (data.version !== 1) return null;
  if (!Array.isArray(data.cablePartIds) || !Array.isArray(data.pylonPartIds) || !Array.isArray(data.cableLines)) {
    return null;
  }
  return {
    ...data,
    stayPartIds: Array.isArray(data.stayPartIds) ? data.stayPartIds : [],
    stayLines3d: Array.isArray(data.stayLines3d) ? data.stayLines3d : [],
  };
}

async function loadBridgeGltfFromBuffer(buffer: ArrayBuffer): Promise<{
  scene: THREE.Object3D;
  buildingMeta: BridgeBuildingMeta[];
}> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(buffer, "");
  gltf.scene.updateMatrixWorld(true);
  const json = gltf.parser.json as {
    meshes?: { primitives?: { extras?: { buildings?: BridgeBuildingMeta[] } }[] }[];
  };
  const buildingMeta = json.meshes?.[0]?.primitives?.[0]?.extras?.buildings ?? [];
  return { scene: gltf.scene, buildingMeta };
}

export async function buildBridgePlanFromGlbBuffer(
  buffer: ArrayBuffer,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  frameSize?: FrameGroundSize,
): Promise<StoredSiteBridgePlan> {
  const { scene, buildingMeta } = await loadBridgeGltfFromBuffer(buffer);
  const mesh = scene.getObjectByName("Buildings-Bridge") as THREE.Mesh | undefined;
  if (!mesh?.geometry) {
    return {
      version: 1,
      deckPartId: BRIDGE_DECK_PART_ID,
      cablePartIds: [],
      stayPartIds: [],
      pylonPartIds: [],
      pylonFootprints: [],
      cableLines: [],
      stayLines3d: [],
    };
  }
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const position = geometry.getAttribute("position");
  if (!position) return parseStoredSiteBridgePlan({})!;
  const out = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const [east, ahd, northNeg] = storedSiteRelativeToScene(
      position.getX(i)!,
      position.getY(i)!,
      position.getZ(i)!,
      manifest,
      origin,
      zone,
    );
    out[i * 3] = east;
    out[i * 3 + 1] = ahd;
    out[i * 3 + 2] = northNeg;
  }
  const sceneGeo = geometry.clone();
  sceneGeo.setAttribute("position", new THREE.BufferAttribute(out, 3));
  const plan = buildBridgePlanFromBridgeGlb(sceneGeo, buildingMeta, sideM, frameShape, frameSize);
  geometry.dispose();
  sceneGeo.dispose();
  return plan;
}

export function bridgePartRole(
  partId: string | null | undefined,
  plan: StoredSiteBridgePlan | null | undefined,
): "deck" | "pylon" | "stay" | "cablePlane" | "unknown" {
  if (!plan || !partId) return "unknown";
  if (partId === plan.deckPartId) return "deck";
  if (plan.pylonPartIds.includes(partId)) return "pylon";
  if (plan.stayPartIds.includes(partId)) return "stay";
  if (plan.cablePartIds.includes(partId)) return "cablePlane";
  return "unknown";
}