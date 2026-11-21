import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { buildingIdFromIntersection } from "../lib/buildingPick";
import {
  LANDMARK_LABEL_SETTLE_MS,
  roofPointVisible,
  type LandmarkLabelSource,
} from "../lib/landmarkLabels";

export type LandmarkScreenLabel = {
  buildingId: number;
  name: string;
  rank: number;
  x: number;
  y: number;
  east: number;
  north: number;
  roofUp: number;
};

export type LandmarkScreenState = { moving: boolean; labels: LandmarkScreenLabel[] };

export type LandmarkExportLabels = (camera: THREE.Camera, width: number, height: number) => LandmarkScreenLabel[];

const ROOF_LIFT_M = 0.3;
const RAY_TOP_M = 10000;

function buildingMeshes(city: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  city.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if (mesh.userData.buildingId != null || (mesh.userData.buildingIdByGroup as number[] | undefined)?.length) meshes.push(mesh);
  });
  return meshes;
}

function meshScale(meshes: readonly THREE.Mesh[]): number {
  return meshes.reduce((sum, mesh) => sum + mesh.scale.y, 0);
}

function roofHeights(sources: readonly LandmarkLabelSource[], meshes: THREE.Mesh[]): Map<number, number> {
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const roofs = new Map<number, number>();
  for (const source of sources) {
    raycaster.set(new THREE.Vector3(source.at[0], RAY_TOP_M, -source.at[1]), down);
    const hit = raycaster.intersectObjects(meshes, false).find((h) => buildingIdFromIntersection(h) === source.buildingId);
    if (hit) roofs.set(source.buildingId, hit.point.y);
  }
  return roofs;
}

function projectLabels(
  sources: readonly LandmarkLabelSource[],
  roofs: ReadonlyMap<number, number>,
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): LandmarkScreenLabel[] {
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const out: LandmarkScreenLabel[] = [];
  for (const source of sources) {
    const roof = roofs.get(source.buildingId);
    if (roof === undefined) continue;
    point.set(source.at[0], roof + ROOF_LIFT_M, -source.at[1]);
    ndc.copy(point).project(camera);
    if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const first = raycaster.intersectObjects(meshes, false)[0];
    const hit = first ? { distance: first.distance, buildingId: buildingIdFromIntersection(first) } : null;
    if (!roofPointVisible(hit, source.buildingId, raycaster.ray.origin.distanceTo(point))) continue;
    out.push({
      buildingId: source.buildingId,
      name: source.name,
      rank: source.rank,
      x: offsetX + (ndc.x * 0.5 + 0.5) * width,
      y: offsetY + (-ndc.y * 0.5 + 0.5) * height,
      east: source.at[0],
      north: source.at[1],
      roofUp: roof,
    });
  }
  return out;
}

function cameraSignature(camera: THREE.Camera, width: number, height: number): string {
  return `${camera.matrixWorld.elements.join(",")}|${camera.projectionMatrix.elements.join(",")}|${width}x${height}`;
}

export function LandmarkLabelProjector({
  sources,
  enabled,
  onScreens,
  exportRef,
}: {
  sources: readonly LandmarkLabelSource[];
  enabled: boolean;
  onScreens: (state: LandmarkScreenState | null) => void;
  exportRef: MutableRefObject<LandmarkExportLabels | null>;
}) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const cache = useRef<{
    city: THREE.Object3D;
    sources: readonly LandmarkLabelSource[];
    meshes: THREE.Mesh[];
    scale: number;
    roofs: Map<number, number>;
  } | null>(null);
  const signature = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<LandmarkScreenLabel[]>([]);
  const moving = useRef(false);

  const prepared = () => {
    const city = scene.getObjectByName("CityCut");
    if (!city) return null;
    const hit = cache.current;
    if (hit && hit.city === city && hit.sources === sources && meshScale(hit.meshes) === hit.scale) return hit;
    const meshes = buildingMeshes(city);
    city.updateMatrixWorld(true);
    cache.current = { city, sources, meshes, scale: meshScale(meshes), roofs: roofHeights(sources, meshes) };
    return cache.current;
  };

  const settle = () => {
    timer.current = null;
    moving.current = false;
    const ready = prepared();
    if (!ready) return;
    const rect = gl.domElement.getBoundingClientRect();
    last.current = projectLabels(sources, ready.roofs, ready.meshes, camera, rect.width, rect.height, rect.left, rect.top);
    onScreens({ moving: false, labels: last.current });
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(settle, LANDMARK_LABEL_SETTLE_MS);
  };

  useEffect(() => {
    if (!enabled || sources.length === 0) {
      exportRef.current = null;
      last.current = [];
      onScreens(null);
      return;
    }
    exportRef.current = (exportCamera, width, height) => {
      const ready = prepared();
      return ready ? projectLabels(sources, ready.roofs, ready.meshes, exportCamera, width, height) : [];
    };
    cache.current = null;
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      exportRef.current = null;
    };
  }, [enabled, sources]);

  useFrame(() => {
    if (!enabled || sources.length === 0) return;
    const next = cameraSignature(camera, size.width, size.height);
    if (next === signature.current) return;
    signature.current = next;
    if (!moving.current) {
      moving.current = true;
      onScreens({ moving: true, labels: last.current });
    }
    schedule();
  });

  return null;
}
