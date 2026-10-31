import * as THREE from "three";
import type { CityModel } from "../types";
import { SELECTION_OVERLAY_RENDER_ORDER, extrudePart } from "./buildCity";
import { BUILDING_EDGE_THRESHOLD_DEG } from "./buildingEdges";
import { hoverPickBlocked, type BuildingHoverPickGate } from "./buildingHoverPick";
import { getColour } from "./colours";
import { buildingViewportFill, type BuildingColourMode } from "./buildingViewportColor";
import { matteStandardMaterial } from "./matteMaterial";
import { SURFACE } from "./surfaceLayers";
import { themeColor } from "./themeColor";
import { footprintBase } from "./terrain";

export const BUILDING_HOVER_HIGHLIGHT_FILL_OPACITY = 0.26;
export const BUILDING_HOVER_HIGHLIGHT_EDGE_OPACITY = 0.92;
export const BUILDING_HOVER_ACCENT_MIX = 0.38;

export type BuildingHoverHighlightState = {
  highlightedBuildingId: number | null;
};

export function resolveHoverHighlightBuildingId(
  pickedId: number | null,
  gate: BuildingHoverPickGate,
  now = performance.now(),
): number | null {
  if (hoverPickBlocked(gate, now)) return null;
  return pickedId;
}

export function applyHoverHighlightPick(
  prev: BuildingHoverHighlightState,
  pickedId: number | null,
  gate: BuildingHoverPickGate,
  now = performance.now(),
): BuildingHoverHighlightState {
  const highlightedBuildingId = resolveHoverHighlightBuildingId(pickedId, gate, now);
  if (prev.highlightedBuildingId === highlightedBuildingId) return prev;
  return { highlightedBuildingId };
}

export function mixBuildingHoverFill(baseFill: string, accentFill: string): string {
  const base = new THREE.Color(baseFill);
  const accent = new THREE.Color(accentFill);
  base.lerp(accent, BUILDING_HOVER_ACCENT_MIX);
  return `#${base.getHexString()}`;
}

export type BuildingHoverHighlightSlot = {
  group: THREE.Group;
  fillMaterial: THREE.MeshStandardMaterial;
  edgeMaterial: THREE.LineBasicMaterial;
  mountedBuildingId: number | null;
};

export function createBuildingHoverHighlightSlot(): BuildingHoverHighlightSlot {
  const group = new THREE.Group();
  group.name = "BuildingHoverHighlight";
  const fillMaterial = matteStandardMaterial({
    color: getColour("--building-uniform"),
    transparent: true,
    opacity: BUILDING_HOVER_HIGHLIGHT_FILL_OPACITY,
    depthWrite: false,
  });
  fillMaterial.toneMapped = false;
  fillMaterial.depthTest = true;
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: themeColor("--anchored-lens-edge", getColour("--site-building")),
    transparent: true,
    opacity: BUILDING_HOVER_HIGHLIGHT_EDGE_OPACITY,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  return { group, fillMaterial, edgeMaterial, mountedBuildingId: null };
}

function fillForBuilding(colourMode: BuildingColourMode, building: CityModel["buildings"][number]): string {
  return buildingViewportFill(colourMode, building.use, building.source);
}

function geometriesForBuilding(model: CityModel, building: CityModel["buildings"][number]): THREE.BufferGeometry[] {
  if (building.meshDrawnBy != null) return [];
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

function clearSlotMeshes(slot: BuildingHoverHighlightSlot) {
  while (slot.group.children.length > 0) {
    const child = slot.group.children[0]!;
    slot.group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
    }
  }
  slot.mountedBuildingId = null;
  slot.group.visible = false;
}

export function syncBuildingHoverHighlightSlot(
  slot: BuildingHoverHighlightSlot,
  model: CityModel,
  buildingId: number | null,
  pinnedBuildingId: number | null,
  colourMode: BuildingColourMode,
  accentFill = themeColor("--accent-hover", getColour("--site-building")),
): void {
  const edgeAccent = themeColor("--anchored-lens-edge", getColour("--site-building"));
  slot.edgeMaterial.color.setStyle(edgeAccent);
  if (buildingId == null || (pinnedBuildingId != null && buildingId === pinnedBuildingId)) {
    clearSlotMeshes(slot);
    return;
  }
  if (slot.mountedBuildingId === buildingId) {
    slot.group.visible = true;
    return;
  }
  clearSlotMeshes(slot);
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building) return;
  const fill = mixBuildingHoverFill(fillForBuilding(colourMode, building), accentFill);
  slot.fillMaterial.color.setStyle(fill);
  slot.fillMaterial.opacity = BUILDING_HOVER_HIGHLIGHT_FILL_OPACITY;
  const geometries = geometriesForBuilding(model, building);
  if (geometries.length === 0) return;
  for (const geometry of geometries) {
    const mesh = new THREE.Mesh(geometry, slot.fillMaterial);
    mesh.renderOrder = SELECTION_OVERLAY_RENDER_ORDER;
    slot.group.add(mesh);
    const edges = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
    const lines = new THREE.LineSegments(edges, slot.edgeMaterial);
    lines.renderOrder = SELECTION_OVERLAY_RENDER_ORDER + 1;
    slot.group.add(lines);
  }
  slot.mountedBuildingId = buildingId;
  slot.group.visible = true;
}

export function disposeBuildingHoverHighlightSlot(slot: BuildingHoverHighlightSlot) {
  clearSlotMeshes(slot);
  slot.fillMaterial.dispose();
  slot.edgeMaterial.dispose();
}
