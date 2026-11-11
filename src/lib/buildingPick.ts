import * as THREE from "three";

const CLICK_MAX_PX = 5;

export type BuildingPickHandlers = {
  onBuildingPick: (buildingId: number, clientX: number, clientY: number, additive?: boolean) => void;
  onClearPick?: () => void;
};

export function buildingIdFromIntersection(intersection: THREE.Intersection): number | null {
  const object = intersection.object as THREE.Mesh;
  if (object.userData.buildingId != null) return Number(object.userData.buildingId);
  const byGroup = object.userData.buildingIdByGroup as number[] | undefined;
  if (!byGroup?.length || intersection.faceIndex == null) return null;
  const geometry = object.geometry as THREE.BufferGeometry;
  const groups = geometry.groups;
  if (!groups?.length) return byGroup[0] ?? null;
  const faceStart = intersection.faceIndex * 3;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    if (faceStart >= group.start && faceStart < group.start + group.count) {
      return byGroup[index] ?? null;
    }
  }
  return null;
}

export function attachBuildingPick(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  handlers: BuildingPickHandlers,
): () => void {
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
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (moved > CLICK_MAX_PX) return;
    if (event.timeStamp - downAt > 800) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(root, true);
    for (const hit of hits) {
      const buildingId = buildingIdFromIntersection(hit);
      if (buildingId != null) {
        handlers.onBuildingPick(buildingId, event.clientX, event.clientY, event.shiftKey);
        return;
      }
    }
    handlers.onClearPick?.();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
  };
}

export function attachScenePointPick(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  onPoint: (point: THREE.Vector3) => void,
): () => void {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  function onPointerDown(event: PointerEvent) {
    downX = event.clientX;
    downY = event.clientY;
  }
  function onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_MAX_PX) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObject(root, true)) {
      let object: THREE.Object3D | null = hit.object;
      let skip = !(hit.object as THREE.Mesh).isMesh;
      while (object && !skip) {
        if (object.name === "ImportedMassing" || object.userData.noScenePick) skip = true;
        object = object.parent;
      }
      if (skip) continue;
      onPoint(hit.point.clone());
      return;
    }
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
  };
}
