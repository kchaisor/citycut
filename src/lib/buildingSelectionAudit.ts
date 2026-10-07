import * as THREE from "three";
import { SELECTED_BUILDING_FILL_OPACITY } from "./buildCity";

export type BuildingSelectionAudit = {
  buildingId: number;
  hiddenMeshCount: number;
  zeroedGroupCount: number;
  visibleGroupCount: number;
  overlayInScene: boolean;
  overlayFillTransparent: boolean;
  overlayFillOpacity: number;
  overlayDashedLineCount: number;
  overlayLineDistancesReady: boolean;
};

function sameBuildingId(stored: unknown, buildingId: number): boolean {
  if (stored == null) return false;
  return Number(stored) === buildingId;
}

/** Inspect whether the city mesh is hidden and the overlay is configured for QA. */
export function auditBuildingSelection(
  cityRoot: THREE.Object3D,
  buildingId: number,
  overlay: THREE.Group | null,
): BuildingSelectionAudit {
  const targetId = Number(buildingId);
  let hiddenMeshCount = 0;
  let zeroedGroupCount = 0;
  let visibleGroupCount = 0;

  cityRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const batch = mesh.name || mesh.parent?.name || "";
    if (!batch.startsWith("Buildings") && !batch.startsWith("source:")) return;

    if (sameBuildingId(mesh.userData.buildingId, targetId)) {
      if (!mesh.visible) hiddenMeshCount += 1;
      return;
    }

    const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
    const groups = mesh.geometry?.groups;
    if (!byGroup?.length || !groups?.length) return;
    for (let index = 0; index < groups.length; index++) {
      if (!sameBuildingId(byGroup[index], targetId)) continue;
      if (groups[index]!.count === 0) zeroedGroupCount += 1;
      else visibleGroupCount += 1;
    }
  });

  const overlayInScene = overlay != null && overlay.parent != null;
  const fillMesh = overlay?.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh | undefined;
  const fillMat = fillMesh?.material as THREE.MeshStandardMaterial | undefined;
  const dashedLines =
    overlay?.children.filter(
      (child) => child instanceof THREE.LineSegments && child.material instanceof THREE.LineDashedMaterial,
    ) ?? [];
  const overlayLineDistancesReady = dashedLines.every((line) => {
    const segments = line as THREE.LineSegments;
    const dist = segments.geometry.getAttribute("lineDistance");
    return dist != null && dist.count > 0;
  });

  return {
    buildingId: targetId,
    hiddenMeshCount,
    zeroedGroupCount,
    visibleGroupCount,
    overlayInScene,
    overlayFillTransparent: Boolean(fillMat?.transparent),
    overlayFillOpacity: fillMat?.opacity ?? 0,
    overlayDashedLineCount: dashedLines.length,
    overlayLineDistancesReady,
  };
}

export function selectionAuditOk(audit: BuildingSelectionAudit): boolean {
  const baseHidden = audit.hiddenMeshCount > 0 || audit.zeroedGroupCount > 0;
  return (
    baseHidden &&
    audit.visibleGroupCount === 0 &&
    audit.overlayInScene &&
    audit.overlayFillTransparent &&
    Math.abs(audit.overlayFillOpacity - SELECTED_BUILDING_FILL_OPACITY) < 0.01 &&
    audit.overlayDashedLineCount > 0 &&
    audit.overlayLineDistancesReady
  );
}
