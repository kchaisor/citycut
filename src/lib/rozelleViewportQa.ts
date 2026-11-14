import * as THREE from "three";
import { getColour } from "./colours";

export type RozelleViewportQa = {
  projection: string;
  waterVisible: boolean;
  waterTriangleCount: number;
  waterColorHex: string;
  bridgeCablesVisible: boolean;
  bridgeCableSegmentCount: number;
  storedEastMin: number;
  storedEastMax: number;
  storedNorthMin: number;
  storedNorthMax: number;
  frameHalfM: number;
};

function meshTriangleCount(mesh: THREE.Mesh): number {
  const index = mesh.geometry.index;
  if (index) return Math.floor(index.count / 3);
  const position = mesh.geometry.getAttribute("position");
  return position ? Math.floor(position.count / 3) : 0;
}

function materialHex(mesh: THREE.Mesh): string {
  const material = mesh.material;
  const item = Array.isArray(material) ? material[0] : material;
  if (item instanceof THREE.MeshStandardMaterial) return `#${item.color.getHexString()}`;
  if (item instanceof THREE.MeshBasicMaterial) return `#${item.color.getHexString()}`;
  return "";
}

export function auditRozelleViewportQa(root: THREE.Object3D, frameHalfM: number, projection: string): RozelleViewportQa {
  let waterVisible = false;
  let waterTriangleCount = 0;
  let waterColorHex = "";
  let bridgeCablesVisible = false;
  let bridgeCableSegmentCount = 0;
  let storedEastMin = Infinity;
  let storedEastMax = -Infinity;
  let storedNorthMin = Infinity;
  let storedNorthMax = -Infinity;

  root.traverse((object) => {
    if (object.name === "Water" && object instanceof THREE.Mesh) {
      waterVisible = object.visible;
      waterTriangleCount = meshTriangleCount(object);
      waterColorHex = materialHex(object);
      return;
    }
    if (object.name === "StoredSiteBridgeCables" && object instanceof THREE.LineSegments) {
      bridgeCablesVisible = object.visible;
      const position = object.geometry.getAttribute("position");
      bridgeCableSegmentCount = position ? Math.floor(position.count / 2) : 0;
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.parent?.name !== "StoredSiteLayer") return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      const east = position.getX(i)!;
      const north = -position.getZ(i)!;
      storedEastMin = Math.min(storedEastMin, east);
      storedEastMax = Math.max(storedEastMax, east);
      storedNorthMin = Math.min(storedNorthMin, north);
      storedNorthMax = Math.max(storedNorthMax, north);
    }
  });

  if (!Number.isFinite(storedEastMin)) {
    storedEastMin = 0;
    storedEastMax = 0;
    storedNorthMin = 0;
    storedNorthMax = 0;
  }

  return {
    projection,
    waterVisible,
    waterTriangleCount,
    waterColorHex,
    bridgeCablesVisible,
    bridgeCableSegmentCount,
    storedEastMin,
    storedEastMax,
    storedNorthMin,
    storedNorthMax,
    frameHalfM,
  };
}

export function rozelleViewportQaPasses(audit: RozelleViewportQa): { ok: boolean; detail: string } {
  const waterHex = getColour("--water-3d").toLowerCase();
  const waterOk =
    audit.waterVisible &&
    audit.waterTriangleCount > 80 &&
    audit.waterColorHex.toLowerCase() === waterHex;
  const frameOk =
    audit.storedEastMin >= -audit.frameHalfM - 2 &&
    audit.storedEastMax <= audit.frameHalfM + 2 &&
    audit.storedNorthMin >= -audit.frameHalfM - 2 &&
    audit.storedNorthMax <= audit.frameHalfM + 2;
  const cablesOk = audit.projection === "plan" ? !audit.bridgeCablesVisible : audit.bridgeCableSegmentCount <= 120;
  const ok = waterOk && frameOk && cablesOk;
  return {
    ok,
    detail: `water=${audit.waterVisible} tris=${audit.waterTriangleCount} hex=${audit.waterColorHex} cablesVis=${audit.bridgeCablesVisible} segs=${audit.bridgeCableSegmentCount} storedE=[${audit.storedEastMin.toFixed(1)},${audit.storedEastMax.toFixed(1)}] storedN=[${audit.storedNorthMin.toFixed(1)},${audit.storedNorthMax.toFixed(1)}] half=${audit.frameHalfM}`,
  };
}