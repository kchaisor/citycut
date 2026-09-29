import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addBuildingEdges, BUILDING_EDGE_THRESHOLD_DEG } from "./buildingEdges";
import { buildCityGroup, disposeObject } from "./buildCity";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";
import type { BuildingFeat, CityModel, Pt } from "../types";

const origin = { lon: 144.94944, lat: -37.8041 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

function building(id: number, center: Pt, use: BuildingFeat["use"], source: BuildingFeat["source"]): BuildingFeat {
  return { id, ring: square(center, 10), holes: [], height: 12, use, source };
}

function model(buildings: BuildingFeat[], terrain = false): CityModel {
  return {
    placeLabel: "Test",
    center: origin,
    sideM: 200,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
    ...(terrain
      ? {
          terrain: {
            cols: 2,
            rows: 2,
            heights: new Float32Array([8, 8, 8, 8]),
            min: 8,
            max: 8,
            spacingM: 200,
            zoom: 14,
            metresPerPixel: 4,
            source: "Mapterhorn",
          },
        }
      : {}),
  };
}

function edgeLines(root: THREE.Object3D): THREE.LineSegments[] {
  const lines: THREE.LineSegments[] = [];
  root.traverse((object) => {
    const line = object as THREE.LineSegments;
    if (line.isLineSegments && line.name === "BuildingEdges") lines.push(line);
  });
  return lines;
}

function segmentCount(lines: THREE.LineSegments[]): number {
  return lines.reduce((sum, line) => sum + line.geometry.getAttribute("position").count / 2, 0);
}

function eachSegment(
  lines: THREE.LineSegments[],
  visit: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => void,
) {
  for (const line of lines) {
    const position = line.geometry.getAttribute("position");
    for (let i = 0; i + 1 < position.count; i += 2) {
      visit(position.getX(i), position.getY(i), position.getZ(i), position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
    }
  }
}

describe("building edges", () => {
  it("draws corners and eaves of one merged batch, not the roof diagonal", () => {
    const group = buildCityGroup(model([building(1, [0, 0], "residential", "osm_tag")]), {
      uniformBuildings: true,
    });
    try {
      expect(edgeLines(group)).toHaveLength(0);
      const stats = addBuildingEdges(group);
      const lines = edgeLines(group);
      expect(lines).toHaveLength(1);
      expect(stats.batches).toBe(1);
      expect(stats.segments).toBe(12);
      expect(segmentCount(lines)).toBe(12);
      expect(stats.ms).toBeGreaterThanOrEqual(0);
      const material = lines[0].material as THREE.LineBasicMaterial;
      expect(material.color.getHexString()).toBe("000000");
      expect(material.toneMapped).toBe(false);
      expect(material.polygonOffset).toBe(false);
      expect(lines[0].renderOrder).toBe(SURFACE.building.renderOrder + 1);
      let fill: THREE.MeshStandardMaterial | undefined;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.name === "Buildings") fill = mesh.material as THREE.MeshStandardMaterial;
      });
      expect(fill?.polygonOffset).toBe(true);
      expect(fill?.polygonOffsetFactor).toBeGreaterThan(0);
      expect(fill?.polygonOffsetUnits).toBeGreaterThan(0);

      const changed = { x: 0, y: 0, z: 0 };
      eachSegment(lines, (ax, ay, az, bx, by, bz) => {
        if (Math.abs(ax - bx) > 1e-3) changed.x += 1;
        if (Math.abs(ay - by) > 1e-3) changed.y += 1;
        if (Math.abs(az - bz) > 1e-3) changed.z += 1;
        const axes = Number(Math.abs(ax - bx) > 1e-3) + Number(Math.abs(ay - by) > 1e-3) + Number(Math.abs(az - bz) > 1e-3);
        expect(axes).toBe(1);
      });
      expect(changed).toEqual({ x: 4, y: 4, z: 4 });

      let minY = Infinity;
      let maxY = -Infinity;
      eachSegment(lines, (_ax, ay, _az, _bx, by) => {
        minY = Math.min(minY, ay, by);
        maxY = Math.max(maxY, ay, by);
      });
      expect(minY).toBeCloseTo(SURFACE.building.lift, 4);
      expect(maxY).toBeCloseTo(12 + SURFACE.building.lift, 4);
    } finally {
      disposeObject(group);
    }
  });

  it("uses one line object per colour batch and one when the colour is uniform", () => {
    const buildings = [
      building(1, [-20, 0], "residential", "osm_tag"),
      building(2, [20, 0], "civic", "osm_landuse"),
    ];
    const byUse = buildCityGroup(model(buildings));
    const uniform = buildCityGroup(model(buildings), { uniformBuildings: true });
    const bySource = buildCityGroup(model(buildings), { colourBySource: true });
    try {
      expect(addBuildingEdges(byUse).batches).toBe(2);
      expect(edgeLines(byUse)).toHaveLength(2);
      expect(segmentCount(edgeLines(byUse))).toBe(24);

      expect(addBuildingEdges(uniform).batches).toBe(1);
      expect(edgeLines(uniform)).toHaveLength(1);
      expect(segmentCount(edgeLines(uniform))).toBe(24);

      expect(addBuildingEdges(bySource).batches).toBe(2);
      expect(edgeLines(bySource)).toHaveLength(2);
    } finally {
      disposeObject(byUse);
      disposeObject(uniform);
      disposeObject(bySource);
    }
  });

  it("follows a terrain base without shifting the outline off the mesh", () => {
    const city = model([building(1, [0, 0], "unclassified", "none")], true);
    const group = buildCityGroup(city);
    try {
      addBuildingEdges(group);
      const lines = edgeLines(group);
      expect(lines).toHaveLength(1);
      let lineMin = Infinity;
      let lineMax = -Infinity;
      eachSegment(lines, (_ax, ay, _az, _bx, by) => {
        lineMin = Math.min(lineMin, ay, by);
        lineMax = Math.max(lineMax, ay, by);
      });
      const base = footprintBase(city.terrain!, city.buildings[0].ring, city.sideM);
      expect(lineMin).toBeCloseTo(base + SURFACE.building.lift, 3);
      expect(lineMax - lineMin).toBeCloseTo(12, 3);
    } finally {
      disposeObject(group);
    }
  });

  it("leaves the export group without outlines or a shifted fill", () => {
    const group = buildCityGroup(model([building(1, [0, 0], "residential", "osm_tag")]), {
      splitBuildings: true,
    });
    try {
      expect(edgeLines(group)).toHaveLength(0);
      let meshes = 0;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !object.name.startsWith("Buildings")) return;
        meshes += 1;
        const material = mesh.material as THREE.MeshStandardMaterial;
        expect(material.polygonOffsetFactor).toBe(SURFACE.building.polygonOffsetFactor);
        expect(material.polygonOffsetUnits).toBe(SURFACE.building.polygonOffsetUnits);
      });
      expect(meshes).toBe(1);
    } finally {
      disposeObject(group);
    }
  });

  it("keeps the building fill in front of the terrain by the same bias", () => {
    const city = model([building(1, [0, 0], "unclassified", "none")], true);
    const group = buildCityGroup(city);
    try {
      const terrain = group.getObjectByName("Terrain") as THREE.Mesh;
      const terrainMaterial = terrain.material as THREE.MeshStandardMaterial;
      const gapFactor = SURFACE.building.polygonOffsetFactor - terrainMaterial.polygonOffsetFactor;
      const gapUnits = SURFACE.building.polygonOffsetUnits - terrainMaterial.polygonOffsetUnits;
      addBuildingEdges(group);
      let fill: THREE.MeshStandardMaterial | undefined;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.name.startsWith("Buildings")) fill = mesh.material as THREE.MeshStandardMaterial;
      });
      expect(fill).toBeTruthy();
      expect(fill!.polygonOffsetFactor - terrainMaterial.polygonOffsetFactor).toBe(gapFactor);
      expect(fill!.polygonOffsetUnits - terrainMaterial.polygonOffsetUnits).toBe(gapUnits);
      expect(fill!.polygonOffsetFactor).toBeGreaterThan(0);
      expect(BUILDING_EDGE_THRESHOLD_DEG).toBeGreaterThanOrEqual(20);
      expect(BUILDING_EDGE_THRESHOLD_DEG).toBeLessThanOrEqual(30);
    } finally {
      disposeObject(group);
    }
  });

  it("drops a coplanar triangulation seam that a 0° threshold would keep", () => {
    const geometry = new THREE.BufferGeometry();
    // Two coplanar triangles of a flat roof, plus no wall. The shared diagonal
    // is a seam; the boundary is a real edge.
    const positions = [
      0, 0, 0, 2, 0, 0, 2, 0, 2,
      0, 0, 0, 2, 0, 2, 0, 0, 2,
    ];
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const loose = new THREE.EdgesGeometry(geometry, 0);
    const tight = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
    expect(loose.getAttribute("position").count).toBeGreaterThan(tight.getAttribute("position").count);
    expect(tight.getAttribute("position").count).toBe(8);
    loose.dispose();
    tight.dispose();
    geometry.dispose();
  });
});
