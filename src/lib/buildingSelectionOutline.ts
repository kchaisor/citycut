import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { CityModel } from "../types";
import { extrudePart, SELECTION_OVERLAY_RENDER_ORDER } from "./buildCity";
import { BUILDING_EDGE_THRESHOLD_DEG } from "./buildingEdges";
import { getColour } from "./colours";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";

export const SELECTION_OUTLINE_DASH_PX = 8;
export const SELECTION_OUTLINE_GAP_PX = 6;
export const SELECTION_OUTLINE_WIDTH_PX = 2;

export type SelectionOutlineSlot = {
  group: THREE.Group;
  lineMaterials: LineMaterial[];
};

function edgesGeometryForBuilding(model: CityModel, buildingId: number): THREE.BufferGeometry[] {
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building) return [];
  const base =
    (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
  const parts =
    building.extrusionParts && building.extrusionParts.length > 0
      ? building.extrusionParts
      : [{ ring: building.ring, holes: building.holes, height: building.height }];
  const geometries: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const geometry = extrudePart(part.ring, part.holes, part.height, base + (part.base ?? 0));
    if (geometry) geometries.push(geometry);
  }
  return geometries;
}

export function createBuildingSelectionOutlineGroup(
  model: CityModel,
  buildingIds: readonly number[],
): SelectionOutlineSlot | null {
  const unique = [...new Set(buildingIds.map((id) => Number(id)))];
  const group = new THREE.Group();
  group.name = "BuildingSelectionOutline";
  const lineMaterials: LineMaterial[] = [];
  const ink = getColour("--view-ink");
  for (const buildingId of unique) {
    for (const geometry of edgesGeometryForBuilding(model, buildingId)) {
      const edges = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
      geometry.dispose();
      const position = edges.getAttribute("position");
      if (!position || position.count < 2) {
        edges.dispose();
        continue;
      }
      const segGeometry = new LineSegmentsGeometry();
      segGeometry.setPositions(position.array as Float32Array);
      edges.dispose();
      const material = new LineMaterial({
        color: ink,
        linewidth: SELECTION_OUTLINE_WIDTH_PX,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        worldUnits: false,
        dashed: true,
        dashSize: SELECTION_OUTLINE_DASH_PX,
        gapSize: SELECTION_OUTLINE_GAP_PX,
        toneMapped: false,
      });
      lineMaterials.push(material);
      const lines = new LineSegments2(segGeometry, material);
      lines.computeLineDistances();
      lines.renderOrder = SELECTION_OVERLAY_RENDER_ORDER + 1;
      lines.frustumCulled = false;
      group.add(lines);
    }
  }
  if (group.children.length === 0) return null;
  return { group, lineMaterials };
}

export function disposeSelectionOutlineSlot(slot: SelectionOutlineSlot) {
  slot.group.traverse((child) => {
    const lines = child as LineSegments2;
    if (!lines.isLineSegments2) return;
    lines.geometry.dispose();
    lines.material.dispose();
  });
  while (slot.group.children.length > 0) {
    slot.group.remove(slot.group.children[0]!);
  }
}
