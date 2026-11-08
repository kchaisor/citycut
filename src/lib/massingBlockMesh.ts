import * as THREE from "three";
import { BUILDING_EDGE_THRESHOLD_DEG } from "./buildingEdges";
import { getColour } from "./colours";
import { extrudePart } from "./buildCity";
import { matteStandardMaterial } from "./matteMaterial";
import { footprintBase, sampleTerrain } from "./terrain";
import { SURFACE } from "./surfaceLayers";
import type { CityModel, Pt, Ring } from "../types";
import {
  blockCentroid,
  footprintFromCenterline,
  massingBlockHeight,
  type MassingBlock,
} from "./massingBlock";

export const MASSING_BLOCK_GROUP = "DrawnMassingBlocks";

export function massingBlockRing(block: MassingBlock): Ring {
  return footprintFromCenterline(block.centerline, block.width_m, block.flipped);
}

function footprintOpenVertices(ring: Ring): Pt[] {
  if (ring.length < 2) return [];
  const last = ring[ring.length - 1]!;
  const first = ring[0]!;
  if (last[0] === first[0] && last[1] === first[1]) return ring.slice(0, -1);
  return ring.slice();
}

export function buildMassingBlockMesh(
  model: Pick<CityModel, "terrain" | "sideM">,
  block: MassingBlock,
): THREE.Mesh | null {
  const ring = massingBlockRing(block);
  const open = footprintOpenVertices(ring);
  if (open.length < 3) return null;
  const base =
    (model.terrain ? footprintBase(model.terrain, open, model.sideM) : 0) + SURFACE.building.lift;
  const height = massingBlockHeight(block);
  const geometry = extrudePart(open, [], height, base);
  if (!geometry) return null;
  const material = matteStandardMaterial({
    color: getColour("--imported-massing"),
    roughness: 0.92,
    metalness: 0,
  });
  material.toneMapped = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "DrawnMassingBlock";
  mesh.userData.massingBlockId = block.id;
  mesh.userData.noScenePick = false;
  mesh.renderOrder = SURFACE.building.renderOrder + 40;
  return mesh;
}

export function buildMassingBlockSelectionOutline(
  model: Pick<CityModel, "terrain" | "sideM">,
  block: MassingBlock,
): THREE.LineSegments | null {
  const ring = massingBlockRing(block);
  const open = footprintOpenVertices(ring);
  const base =
    (model.terrain ? footprintBase(model.terrain, open, model.sideM) : 0) + SURFACE.building.lift;
  const height = massingBlockHeight(block);
  const geometry = extrudePart(open, [], height, base);
  if (!geometry) return null;
  const edges = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
  const material = new THREE.LineBasicMaterial({
    color: getColour("--use-commercial"),
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(edges, material);
  lines.renderOrder = SURFACE.building.renderOrder + 200;
  lines.userData.noScenePick = true;
  return lines;
}

export function buildMassingFloorGuides(
  model: Pick<CityModel, "terrain" | "sideM">,
  block: MassingBlock,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.noScenePick = true;
  const ring = massingBlockRing(block);
  const open = footprintOpenVertices(ring);
  const base =
    (model.terrain ? footprintBase(model.terrain, open, model.sideM) : 0) + SURFACE.building.lift;
  const material = new THREE.LineDashedMaterial({
    color: getColour("--use-commercial"),
    dashSize: 1.2,
    gapSize: 0.8,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  for (let floor = 1; floor < block.floors; floor++) {
    const y = base + floor * block.floorHeight_m;
    const points: number[] = [];
    for (const [e, n] of open) {
      points.push(e, y, -n);
    }
    points.push(open[0]![0], y, -open[0]![1]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = SURFACE.building.renderOrder + 190;
    group.add(line);
  }
  return group;
}

export function buildMassingHeightHandle(
  model: Pick<CityModel, "terrain" | "sideM">,
  block: MassingBlock,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "MassingHeightHandle";
  group.userData.massingHeightHandle = block.id;
  const centroid = blockCentroid(block.centerline);
  const ring = massingBlockRing(block);
  const base =
    (model.terrain ? footprintBase(model.terrain, footprintOpenVertices(ring), model.sideM) : 0) + SURFACE.building.lift;
  const topY = base + massingBlockHeight(block);
  const x = centroid[0];
  const z = -centroid[1];
  const shaft = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, topY, z),
    new THREE.Vector3(x, topY + 4, z),
  ]);
  const lineMat = new THREE.LineBasicMaterial({
    color: getColour("--use-commercial"),
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const shaftLine = new THREE.Line(shaft, lineMat);
  shaftLine.renderOrder = SURFACE.building.renderOrder + 210;
  group.add(shaftLine);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 2, 12),
    matteStandardMaterial({ color: getColour("--use-commercial") }),
  );
  cone.position.set(x, topY + 5, z);
  cone.rotation.x = Math.PI;
  cone.renderOrder = SURFACE.building.renderOrder + 211;
  cone.userData.massingHeightHandle = block.id;
  group.add(cone);
  return group;
}

export function buildMassingPreviewMesh(
  model: Pick<CityModel, "terrain" | "sideM">,
  ring: Ring,
  opacity = 0.45,
): THREE.Mesh | null {
  const open = footprintOpenVertices(ring);
  const base =
    (model.terrain ? footprintBase(model.terrain, open, model.sideM) : 0) + SURFACE.building.lift;
  const geometry = extrudePart(open, [], 0.4, base);
  if (!geometry) return null;
  const material = matteStandardMaterial({
    color: getColour("--imported-massing"),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  material.toneMapped = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.noScenePick = true;
  mesh.renderOrder = SURFACE.building.renderOrder + 30;
  return mesh;
}

/**
 * Ground-draped centreline for an in-progress draw: a world-space line (start → snapped end)
 * plus endpoint ticks, so it stays glued to the surface under orbit/zoom, unlike a DOM overlay.
 */
function previewRibbonSegment(
  model: Pick<CityModel, "terrain" | "sideM">,
  a: [number, number],
  b: [number, number],
  lift: number,
): THREE.Mesh {
  const steps = 24;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const half = 0.7;
  const px = (-(b[1] - a[1]) / len) * half;
  const py = ((b[0] - a[0]) / len) * half;
  const pts: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = a[0] + (b[0] - a[0]) * t;
    const n = a[1] + (b[1] - a[1]) * t;
    const h = (model.terrain ? sampleTerrain(model.terrain, e, n, model.sideM) : 0) + lift;
    pts.push(e + px, h, -(n + py), e - px, h, -(n - py));
    if (i < steps) {
      const o = i * 2;
      index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({
    color: getColour("--massing-preview-line"),
    depthTest: false,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });
  material.toneMapped = false;
  const line = new THREE.Mesh(geometry, material);
  line.renderOrder = SURFACE.building.renderOrder + 40;
  line.userData.noScenePick = true;
  line.raycast = () => {};
  return line;
}

export function buildMassingPreviewLine(
  model: Pick<CityModel, "terrain" | "sideM">,
  polyline: readonly [number, number][],
): THREE.Group {
  const group = new THREE.Group();
  group.name = "MassingPreviewLine";
  group.userData.noScenePick = true;
  const lift = SURFACE.building.lift + 0.35;
  for (let i = 0; i < polyline.length - 1; i++) {
    group.add(previewRibbonSegment(model, polyline[i]!, polyline[i + 1]!, lift));
  }
  const seen = new Set<string>();
  for (const [e, n] of polyline) {
    const key = `${e.toFixed(3)},${n.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const h = (model.terrain ? sampleTerrain(model.terrain, e, n, model.sideM) : 0) + lift;
    const circle = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 20),
      new THREE.MeshBasicMaterial({ color: getColour("--massing-preview-line"), depthTest: false, transparent: true }),
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(e, h, -n);
    circle.renderOrder = SURFACE.building.renderOrder + 41;
    circle.userData.noScenePick = true;
    circle.raycast = () => {};
    group.add(circle);
  }
  return group;
}
