import * as THREE from "three";
import { LANDMARK_PILL_HEIGHT_PX } from "./landmarkLabels";

export type ImportedLabelAnchor = {
  fileId: string;
  buildingId: string;
  name: string;
  points: THREE.Vector3[];
};

export type ImportedScreenLabel = Omit<ImportedLabelAnchor, "points"> & { x: number; y: number };

export const IMPORTED_LABEL_LIFT_PX = LANDMARK_PILL_HEIGHT_PX / 2 + 6;

export function importedLabelOccluders(city: THREE.Object3D | null, imported: THREE.Object3D | null): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const collect = (root: THREE.Object3D | null, keep: (mesh: THREE.Mesh) => boolean) =>
    root?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.visible && keep(mesh)) out.push(mesh);
    });
  collect(city, (mesh) => mesh.userData.buildingId != null || Boolean((mesh.userData.buildingIdByGroup as number[] | undefined)?.length));
  collect(imported, (mesh) => mesh.userData.importedBuildingId != null);
  return out;
}

const ROOF_SPOTS: readonly [number, number][] = [
  [0.5, 0.5],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

export function importedLabelAnchors(group: THREE.Object3D | null): ImportedLabelAnchor[] {
  if (!group) return [];
  group.updateMatrixWorld(true);
  const out: ImportedLabelAnchor[] = [];
  const box = new THREE.Box3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || mesh.userData.importedBuildingId == null) return;
    box.setFromObject(mesh);
    if (box.isEmpty()) return;
    out.push({
      fileId: mesh.userData.importedMassingId as string,
      buildingId: mesh.userData.importedBuildingId as string,
      name: mesh.name,
      points: ROOF_SPOTS.map(
        ([u, v]) =>
          new THREE.Vector3(
            THREE.MathUtils.lerp(box.min.x, box.max.x, u),
            box.max.y,
            THREE.MathUtils.lerp(box.min.z, box.max.z, v),
          ),
      ),
    });
  });
  return out;
}

const ROOF_TOLERANCE_M = 1;

export function projectImportedLabels(
  anchors: readonly ImportedLabelAnchor[],
  camera: THREE.Camera,
  rect: { left: number; top: number; width: number; height: number },
  occluders: readonly THREE.Object3D[] = [],
): ImportedScreenLabel[] {
  camera.updateMatrixWorld();
  const ndc = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const out: ImportedScreenLabel[] = [];
  for (const { points, ...anchor } of anchors) {
    for (const point of points) {
      ndc.copy(point).project(camera);
      if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
      if (occluders.length > 0) {
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const first = raycaster.intersectObjects(occluders as THREE.Object3D[], false)[0];
        const own = first?.object.userData.importedBuildingId === anchor.buildingId;
        if (first && !own && first.distance < raycaster.ray.origin.distanceTo(point) - ROOF_TOLERANCE_M) continue;
      }
      out.push({
        ...anchor,
        x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height - IMPORTED_LABEL_LIFT_PX,
      });
      break;
    }
  }
  return out;
}
