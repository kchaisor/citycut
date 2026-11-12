import * as THREE from "three";
import type { TreeFeat } from "../types";
import { buildingIdFromIntersection } from "./buildingPick";
import { sampleTerrain } from "./terrain";

const CLICK_MAX_PX = 5;

export type SceneInspectWorld = {
  east: number;
  north: number;
  up: number;
};

export type SceneSelection =
  | {
      kind: "building";
      buildingId: number;
      clientX: number;
      clientY: number;
      world: SceneInspectWorld;
      additive?: boolean;
    }
  | {
      kind: "tree";
      treeId: number;
      clientX: number;
      clientY: number;
      world: SceneInspectWorld;
    }
  | {
      kind: "terrain";
      clientX: number;
      clientY: number;
      world: SceneInspectWorld;
      elevation: number;
    };

export function sceneSelectionBuildingId(selection: SceneSelection | null): number | null {
  if (!selection || selection.kind !== "building") return null;
  return selection.buildingId;
}

export function nearestTreeIdAt(east: number, north: number, trees: TreeFeat[], searchRadiusM: number): number | null {
  let best: { id: number; dist: number } | null = null;
  for (const tree of trees) {
    const dist = Math.hypot(tree.at[0] - east, tree.at[1] - north);
    const radius = Math.max(tree.crown_diameter_m / 2, 2);
    const limit = Math.max(searchRadiusM, radius * 1.25);
    if (dist > limit) continue;
    if (!best || dist < best.dist) best = { id: tree.id, dist };
  }
  return best?.id ?? null;
}

export type SceneInspectPickHandlers = {
  onPick: (selection: SceneSelection) => void;
  onClear?: () => void;
};

export type SceneInspectPickContext = {
  trees: TreeFeat[];
  terrain?: import("../types").TerrainField | null;
  sideM: number;
};

export function attachSceneInspectPick(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  context: SceneInspectPickContext,
  handlers: SceneInspectPickHandlers,
): () => void {
  const { trees, terrain, sideM } = context;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let downAt = 0;

  function setPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    downX = event.clientX;
    downY = event.clientY;
    downAt = event.timeStamp;
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_MAX_PX) return;
    if (event.timeStamp - downAt > 800) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(root, true);
    for (const hit of hits) {
      const buildingId = buildingIdFromIntersection(hit);
      if (buildingId != null) {
        handlers.onPick({
          kind: "building",
          buildingId,
          clientX: event.clientX,
          clientY: event.clientY,
          world: { east: hit.point.x, north: -hit.point.z, up: hit.point.y },
          additive: event.shiftKey,
        });
        return;
      }
      let object: THREE.Object3D | null = hit.object;
      let onTrees = false;
      while (object) {
        if (object.name === "Trees") {
          onTrees = true;
          break;
        }
        if (object.userData.noScenePick) break;
        object = object.parent;
      }
      if (onTrees && trees.length > 0) {
        const east = hit.point.x;
        const north = -hit.point.z;
        const treeId = nearestTreeIdAt(east, north, trees, 8);
        if (treeId != null) {
          const tree = trees.find((item) => item.id === treeId)!;
          handlers.onPick({
            kind: "tree",
            treeId,
            clientX: event.clientX,
            clientY: event.clientY,
            world: { east: tree.at[0], north: tree.at[1], up: hit.point.y },
          });
          return;
        }
      }
      const meshName = hit.object.name || hit.object.parent?.name || "";
      if (meshName === "Terrain" || meshName === "Ground") {
        const east = hit.point.x;
        const north = -hit.point.z;
        const elevation = terrain != null ? sampleTerrain(terrain, east, north, sideM) : hit.point.y;
        handlers.onPick({
          kind: "terrain",
          clientX: event.clientX,
          clientY: event.clientY,
          world: { east, north, up: hit.point.y },
          elevation,
        });
        return;
      }
    }
    handlers.onClear?.();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
  };
}
