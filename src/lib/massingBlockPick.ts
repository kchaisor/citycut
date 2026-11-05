import * as THREE from "three";

export type MassingGroundPickHandlers = {
  onPointerDown: (east: number, north: number, hitBlockId: string | null) => void;
  onPointerMove: (east: number, north: number, clientX: number, clientY: number) => void;
  onPointerUp: () => void;
  onCancel?: () => void;
  /** When true, pointermove without a pressed button still reports ground hits (click-click preview). */
  hoverActive?: () => boolean;
};

function scenePointFromHit(point: THREE.Vector3): [number, number, number] {
  return [point.x, -point.z, point.y];
}

function pickGround(
  raycaster: THREE.Raycaster,
  root: THREE.Object3D,
  pointer: THREE.Vector2,
  camera: THREE.Camera,
): THREE.Vector3 | null {
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObject(root, true)) {
    let object: THREE.Object3D | null = hit.object;
    let skip = false;
    while (object && !skip) {
      if (object.userData.massingHeightHandle || object.name === "MassingHeightHandle") skip = true;
      if (object.userData.noScenePick && !object.userData.massingBlockId) skip = true;
      object = object.parent;
    }
    if (skip) continue;
    return hit.point.clone();
  }
  return null;
}

function pickMassingBlock(raycaster: THREE.Raycaster, root: THREE.Object3D, pointer: THREE.Vector2, camera: THREE.Camera): string | null {
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObject(root, true)) {
    const id = hit.object.userData.massingBlockId as string | undefined;
    if (id) return id;
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const nested = object.userData.massingBlockId as string | undefined;
      if (nested) return nested;
      object = object.parent;
    }
  }
  return null;
}

function pickHeightHandle(raycaster: THREE.Raycaster, root: THREE.Object3D, pointer: THREE.Vector2, camera: THREE.Camera): string | null {
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObject(root, true)) {
    const id = hit.object.userData.massingHeightHandle as string | undefined;
    if (id) return id;
  }
  return null;
}

export function attachMassingGroundPick(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  handlers: MassingGroundPickHandlers,
  active: boolean,
): () => void {
  if (!active) return () => {};
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let dragging = false;

  function setPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    setPointer(event);
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    const blockId = pickMassingBlock(raycaster, root, pointer, camera);
    const ground = pickGround(raycaster, root, pointer, camera);
    if (ground) {
      const [e, n] = scenePointFromHit(ground);
      handlers.onPointerDown(e, n, blockId);
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging && !handlers.hoverActive?.()) return;
    setPointer(event);
    const ground = pickGround(raycaster, root, pointer, camera);
    if (!ground) return;
    const [e, n] = scenePointFromHit(ground);
    handlers.onPointerMove(e, n, event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button !== 0 || !dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
    }
    handlers.onPointerUp();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") handlers.onCancel?.();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
  };
}

export function attachMassingHeightDrag(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  handlers: {
    onStart: (blockId: string) => void;
    onMove: (clientY: number) => void;
    onEnd: () => void;
  },
  active: boolean,
): () => void {
  if (!active) return () => {};
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let dragging = false;

  function setPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    setPointer(event);
    const blockId = pickHeightHandle(raycaster, root, pointer, camera);
    if (!blockId) return;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    handlers.onStart(blockId);
    event.stopPropagation();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    handlers.onMove(event.clientY);
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
    }
    handlers.onEnd();
  }

  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
  };
}
