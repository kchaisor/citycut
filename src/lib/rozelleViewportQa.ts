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
  harbourCutWaterZones: number;
  terrainTriangleCount: number;
  terrainTrisBeforeCut: number;
  terrainTrisAfterCut: number;
  storedSiteTriangleCount: number;
  contextTrianglesKept: number;
  waterEastMin: number;
  waterEastMax: number;
  waterNorthMin: number;
  waterNorthMax: number;
  osmWaterRingEastMin: number;
  osmWaterRingEastMax: number;
  osmWaterRingNorthMin: number;
  osmWaterRingNorthMax: number;
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
  let harbourCutWaterZones = 0;
  let terrainTriangleCount = 0;
  let terrainTrisBeforeCut = 0;
  let terrainTrisAfterCut = 0;
  let storedSiteTriangleCount = 0;
  let contextTrianglesKept = 0;
  let waterEastMin = Infinity;
  let waterEastMax = -Infinity;
  let waterNorthMin = Infinity;
  let waterNorthMax = -Infinity;
  let osmWaterRingEastMin = 0;
  let osmWaterRingEastMax = 0;
  let osmWaterRingNorthMin = 0;
  let osmWaterRingNorthMax = 0;

  root.traverse((object) => {
    if (object.name === "CityCut" && object.userData.rozelleHarbourCut) {
      const cut = object.userData.rozelleHarbourCut as {
        waterZoneCount?: number;
        terrainTrisBefore?: number;
        terrainTrisAfter?: number;
        waterRingEastMin?: number;
        waterRingEastMax?: number;
        waterRingNorthMin?: number;
        waterRingNorthMax?: number;
      };
      harbourCutWaterZones = Number(cut.waterZoneCount ?? 0);
      terrainTrisBeforeCut = Number(cut.terrainTrisBefore ?? 0);
      terrainTrisAfterCut = Number(cut.terrainTrisAfter ?? 0);
      if (Number.isFinite(cut.waterRingEastMin)) {
        osmWaterRingEastMin = cut.waterRingEastMin!;
        osmWaterRingEastMax = cut.waterRingEastMax!;
        osmWaterRingNorthMin = cut.waterRingNorthMin!;
        osmWaterRingNorthMax = cut.waterRingNorthMax!;
      }
    }
    if (object.name === "Terrain" && object instanceof THREE.Mesh) {
      terrainTriangleCount = meshTriangleCount(object);
    }
    if (object.name === "Water" && object instanceof THREE.Mesh) {
      waterVisible = object.visible;
      waterTriangleCount = meshTriangleCount(object);
      waterColorHex = materialHex(object);
      const position = object.geometry.getAttribute("position");
      if (position) {
        for (let i = 0; i < position.count; i++) {
          const east = position.getX(i)!;
          const north = -position.getZ(i)!;
          waterEastMin = Math.min(waterEastMin, east);
          waterEastMax = Math.max(waterEastMax, east);
          waterNorthMin = Math.min(waterNorthMin, north);
          waterNorthMax = Math.max(waterNorthMax, north);
        }
      }
      return;
    }
    if (object.name === "StoredSiteBridgeCables" && object instanceof THREE.LineSegments) {
      bridgeCablesVisible = object.visible;
      const position = object.geometry.getAttribute("position");
      bridgeCableSegmentCount = position ? Math.floor(position.count / 2) : 0;
      return;
    }
    if (object.name === "StoredSiteLayer" && object instanceof THREE.Group) {
      const kept = Number(object.userData.rozelleContextTrianglesKept ?? 0);
      if (Number.isFinite(kept) && kept > 0) contextTrianglesKept = kept;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.parent?.name !== "StoredSiteLayer") return;
    storedSiteTriangleCount += meshTriangleCount(mesh);
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
    harbourCutWaterZones,
    terrainTriangleCount,
    terrainTrisBeforeCut,
    terrainTrisAfterCut,
    storedSiteTriangleCount,
    contextTrianglesKept,
    waterEastMin: Number.isFinite(waterEastMin) ? waterEastMin : 0,
    waterEastMax: Number.isFinite(waterEastMax) ? waterEastMax : 0,
    waterNorthMin: Number.isFinite(waterNorthMin) ? waterNorthMin : 0,
    waterNorthMax: Number.isFinite(waterNorthMax) ? waterNorthMax : 0,
    osmWaterRingEastMin,
    osmWaterRingEastMax,
    osmWaterRingNorthMin,
    osmWaterRingNorthMax,
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