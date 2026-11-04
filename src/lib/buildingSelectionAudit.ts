import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { getColour } from "./colours";

export type BuildingSelectionAudit = {
  buildingId: number;
  selectedBuildingIds?: number[];
  hiddenMeshCount: number;
  zeroedGroupCount: number;
  visibleGroupCount: number;
  overlayInScene: boolean;
  overlayFillTransparent: boolean;
  overlayFillOpacity: number;
  overlayDashedLineCount: number;
  overlayLineDistancesReady: boolean;
  selectionFillMeshCount: number;
  selectionFillAccentHex: string;
};

function matchesBuildingId(stored: unknown, targetIds: ReadonlySet<number>): boolean {
  if (stored == null) return false;
  return targetIds.has(Number(stored));
}

export function auditBuildingSelection(
  cityRoot: THREE.Object3D,
  buildingIdOrIds: number | readonly number[],
  overlay: THREE.Group | null,
): BuildingSelectionAudit {
  const ids = Array.isArray(buildingIdOrIds)
    ? buildingIdOrIds.map((id) => Number(id))
    : [Number(buildingIdOrIds)];
  const targetId = ids[0] ?? 0;
  const targetIds = new Set(ids);
  let hiddenMeshCount = 0;
  let zeroedGroupCount = 0;
  let visibleGroupCount = 0;

  cityRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const batch = mesh.name || mesh.parent?.name || "";
    if (!batch.startsWith("Buildings") && !batch.startsWith("source:")) return;

    if (matchesBuildingId(mesh.userData.buildingId, targetIds)) {
      if (!mesh.visible) hiddenMeshCount += 1;
      return;
    }

    const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
    const groups = mesh.geometry?.groups;
    if (!byGroup?.length || !groups?.length) return;
    for (let index = 0; index < groups.length; index++) {
      if (!matchesBuildingId(byGroup[index], targetIds)) continue;
      if (groups[index]!.count === 0) zeroedGroupCount += 1;
      else visibleGroupCount += 1;
    }
  });

  const overlayInScene = overlay != null && overlay.parent != null;
  let fillMesh: THREE.Mesh | undefined;
  let selectionFillMeshCount = 0;
  const dashedLines: LineSegments2[] = [];
  overlay?.traverse((child) => {
    const outline = child as LineSegments2;
    if (child instanceof THREE.Mesh && child.name === "BuildingSelectionFill") {
      selectionFillMeshCount += 1;
      if (!fillMesh) fillMesh = child;
      return;
    }
    if (outline.isLineSegments2 && outline.material instanceof LineMaterial && outline.material.dashed) {
      dashedLines.push(outline);
    }
  });
  const fillMat = fillMesh?.material as THREE.MeshStandardMaterial | undefined;
  const selectionFillAccentHex = fillMat?.color.getHexString() ?? "";
  const overlayLineDistancesReady =
    dashedLines.length > 0 &&
    dashedLines.every((segments) => {
      const attrs = segments.geometry.attributes as Record<string, THREE.BufferAttribute | undefined>;
      const dist = attrs.instanceDistanceStart ?? attrs.lineDistance;
      return dist != null && dist.count > 0;
    });

  return {
    buildingId: targetId,
    selectedBuildingIds: ids,
    hiddenMeshCount,
    zeroedGroupCount,
    visibleGroupCount,
    overlayInScene,
    overlayFillTransparent: fillMat ? Boolean(fillMat.transparent) : true,
    overlayFillOpacity: fillMat?.opacity ?? 0,
    overlayDashedLineCount: dashedLines.length,
    overlayLineDistancesReady,
    selectionFillMeshCount,
    selectionFillAccentHex,
  };
}

export function selectionFillMatchesAccent(audit: BuildingSelectionAudit): boolean {
  const accent = getColour("--building-selection-fill").replace("#", "").toLowerCase();
  return audit.selectionFillMeshCount > 0 && audit.selectionFillAccentHex.toLowerCase() === accent;
}

export function selectionAuditOk(audit: BuildingSelectionAudit): boolean {
  return (
    audit.hiddenMeshCount === 0 &&
    audit.zeroedGroupCount === 0 &&
    audit.overlayDashedLineCount > 0 &&
    audit.selectionFillMeshCount > 0 &&
    selectionFillMatchesAccent(audit) &&
    audit.overlayFillOpacity >= 0.99 &&
    (!audit.overlayInScene || audit.overlayLineDistancesReady)
  );
}
