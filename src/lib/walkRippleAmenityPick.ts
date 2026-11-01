import * as THREE from "three";
import type { WalkRippleAmenityBeaconLayer } from "./walkRippleAmenityBeaconLayer";
import type { AmenityArrival } from "./walkRippleAmenityReach";

const CLICK_MAX_PX = 5;

export function attachWalkRippleAmenityPick(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  layer: WalkRippleAmenityBeaconLayer,
  onPick: (amenity: AmenityArrival, clientX: number, clientY: number) => void,
  onClear?: () => void,
): () => void {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;

  function setPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    downX = event.clientX;
    downY = event.clientY;
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_MAX_PX) return;
    const screenPick = layer.pickAmenityAtClient(camera, canvas, event.clientX, event.clientY);
    if (screenPick) {
      onPick(screenPick, event.clientX, event.clientY);
      return;
    }
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const meshes = layer.beaconMeshes().filter((mesh) => mesh.visible);
    if (meshes.length === 0) {
      onClear?.();
      return;
    }
    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      if (hit.instanceId == null) continue;
      const mesh = hit.object as THREE.InstancedMesh & { userData: { amenityType: import("./walkRippleAmenityTypes").WalkRippleAmenityType } };
      const amenity = layer.amenityAt(mesh.userData.amenityType, hit.instanceId);
      if (amenity) {
        onPick(amenity, event.clientX, event.clientY);
        return;
      }
    }
    onClear?.();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
  };
}
