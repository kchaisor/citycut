import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addBuildingEdges } from "./buildingEdges";
import { buildSunHoursFaceMeshes } from "./sunHoursDirectAssess";
import { directSunHoursSampleSet } from "./sunHoursDirectSample";
import { FAST_SUN_HOURS_PARAMS } from "./sunHoursQuality";
import {
  appendBuildingRoofFootprint,
  extrudedRoofTopYM,
  ROOF_OVERLAY_CLEARANCE_M,
} from "./sunHoursRoofFootprint";
import { SURFACE } from "./surfaceLayers";
import { sunHoursDirectRgb, sunHoursGroundRgba } from "./sunHoursGround";
import { applySolarGreyscale } from "./solarGreyscale";
import { setSunHoursMassingFillVisible } from "./sunHoursFaceTint";
import type { BuildingFeat, CityModel, Ring } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };

function boxRing(east: number, north: number, size: number): Ring {
  return [
    [east, north],
    [east + size, north],
    [east + size, north + size],
    [east, north + size],
    [east, north],
  ];
}

function boxBuilding(id: number, east = -10, north = -10, size = 20, height = 12): BuildingFeat {
  return {
    id,
    ring: boxRing(east, north, size),
    holes: [],
    height,
    use: "residential",
    source: "none",
  };
}

function model(buildings: BuildingFeat[], sideM = 120): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function facesFor(city: CityModel, hourValue = 4, scale = 8) {
  const { samples, wallCellM, roofCellM } = directSunHoursSampleSet(city, FAST_SUN_HOURS_PARAMS);
  const hours = new Float32Array(samples.length).fill(hourValue);
  return {
    samples,
    hours,
    overlay: buildSunHoursFaceMeshes(city, samples, hours, scale, {
      cellM: FAST_SUN_HOURS_PARAMS.cellM,
      wallCellM,
      roofCellM,
      stepMinutes: FAST_SUN_HOURS_PARAMS.stepMinutes,
    }),
  };
}

function uniqueYs(positions: Float32Array): number[] {
  const values = new Set<number>();
  for (let index = 1; index < positions.length; index += 3) values.add(positions[index]!);
  return [...values].sort((a, b) => a - b);
}

describe("sun hours colours sit on the real building faces", () => {
  it("keeps zero roof clearance and colours roofs on the extruded roof plane", () => {
    expect(ROOF_OVERLAY_CLEARANCE_M).toBe(0);
    const building = boxBuilding(1);
    const city = model([building]);
    const roofPositions: number[] = [];
    appendBuildingRoofFootprint(city, building, [], new Float32Array(), 8, roofPositions, []);
    const roofY = uniqueYs(new Float32Array(roofPositions));
    expect(roofY).toHaveLength(1);
    expect(roofY[0]!).toBeCloseTo(extrudedRoofTopYM(city, building), 5);
    expect(roofY[0]!).toBeCloseTo(SURFACE.building.lift + building.height, 5);
  });

  it("puts wall vertices on the footprint and meets the roof at the top edge", () => {
    const building = boxBuilding(1, -10, -10, 20, 12);
    const city = model([building]);
    const { overlay } = facesFor(city);
    expect(overlay.wallPositions.length).toBeGreaterThan(0);
    const roofY = SURFACE.building.lift + building.height;
    const baseY = SURFACE.building.lift;
    const ringXs = new Set([ -10, 10 ]);
    const ringZs = new Set([ 10, -10 ]);
    for (let index = 0; index < overlay.wallPositions.length; index += 3) {
      const x = overlay.wallPositions[index]!;
      const y = overlay.wallPositions[index + 1]!;
      const z = overlay.wallPositions[index + 2]!;
      const onEastWest = ringXs.has(x) && z >= -10 - 1e-6 && z <= 10 + 1e-6;
      const onNorthSouth = ringZs.has(z) && x >= -10 - 1e-6 && x <= 10 + 1e-6;
      expect(onEastWest || onNorthSouth).toBe(true);
      expect(y).toBeGreaterThanOrEqual(baseY - 1e-6);
      expect(y).toBeLessThanOrEqual(roofY + 1e-6);
    }
    const wallTop = Math.max(...uniqueYs(overlay.wallPositions));
    const roofPlane = uniqueYs(overlay.roofPositions)[0]!;
    expect(wallTop).toBeCloseTo(roofPlane, 5);
    expect(wallTop).toBeCloseTo(roofY, 5);
  });

  it("meets neighbouring walls at the building corner without overlapping past it", () => {
    const building = boxBuilding(1, -10, -10, 20, 12);
    const city = model([building]);
    const { overlay } = facesFor(city);
    const corners = [
      [-10, SURFACE.building.lift, 10],
      [10, SURFACE.building.lift, 10],
      [10, SURFACE.building.lift, -10],
      [-10, SURFACE.building.lift, -10],
    ];
    for (const [cx, , cz] of corners) {
      const hits = [];
      for (let index = 0; index < overlay.wallPositions.length; index += 3) {
        const x = overlay.wallPositions[index]!;
        const z = overlay.wallPositions[index + 2]!;
        if (Math.abs(x - cx) < 1e-5 && Math.abs(z - cz) < 1e-5) hits.push(index);
      }
      expect(hits.length).toBeGreaterThan(0);
    }
    for (let index = 0; index < overlay.wallPositions.length; index += 3) {
      const x = overlay.wallPositions[index]!;
      const z = overlay.wallPositions[index + 2]!;
      expect(x).toBeGreaterThanOrEqual(-10 - 1e-6);
      expect(x).toBeLessThanOrEqual(10 + 1e-6);
      expect(z).toBeGreaterThanOrEqual(-10 - 1e-6);
      expect(z).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it("uses the same colour scale on a roof cell, a wall cell and the ground palette", () => {
    const scale = 8;
    const hour = 4;
    const rgb = sunHoursDirectRgb(hour, scale);
    const [r, g, b] = sunHoursGroundRgba(hour, scale, false);
    expect(rgb[0]).toBeCloseTo(r / 255, 10);
    expect(rgb[1]).toBeCloseTo(g / 255, 10);
    expect(rgb[2]).toBeCloseTo(b / 255, 10);
    const building = boxBuilding(1);
    const { overlay } = facesFor(model([building]), hour, scale);
    for (let index = 0; index < overlay.roofColors.length; index += 3) {
      expect(overlay.roofColors[index]).toBeCloseTo(rgb[0], 5);
      expect(overlay.roofColors[index + 1]).toBeCloseTo(rgb[1], 5);
      expect(overlay.roofColors[index + 2]).toBeCloseTo(rgb[2], 5);
    }
    for (let index = 0; index < overlay.wallColors.length; index += 3) {
      expect(overlay.wallColors[index]).toBeCloseTo(rgb[0], 5);
      expect(overlay.wallColors[index + 1]).toBeCloseTo(rgb[1], 5);
      expect(overlay.wallColors[index + 2]).toBeCloseTo(rgb[2], 5);
    }
  });

  it("hides massing fills while Sun hours is on and restores them after, without changing outline counts", () => {
    const city = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ color: "#b35c44" }));
    fill.name = "Buildings";
    city.add(fill);
    addBuildingEdges(city);
    const edges = city.getObjectByName("BuildingEdges");
    expect(edges).toBeTruthy();
    const edgeCount = (edges as THREE.LineSegments).geometry.getAttribute("position").count;
    const imported = new THREE.Group();
    const importedFill = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshStandardMaterial({ color: "#888888" }));
    importedFill.name = "Tower A";
    imported.add(importedFill);
    const outline = new THREE.Object3D();
    outline.name = "Tower A outline";
    imported.add(outline);

    setSunHoursMassingFillVisible(city, imported, true, true, true);
    expect(fill.visible).toBe(false);
    expect(importedFill.visible).toBe(false);
    expect(edges!.visible).toBe(true);
    expect(outline.visible).toBe(true);
    expect((edges as THREE.LineSegments).geometry.getAttribute("position").count).toBe(edgeCount);

    setSunHoursMassingFillVisible(city, imported, true, true, false);
    expect(fill.visible).toBe(true);
    expect(importedFill.visible).toBe(true);
    expect(edges!.visible).toBe(true);
    expect((edges as THREE.LineSegments).geometry.getAttribute("position").count).toBe(edgeCount);
  });

  it("does not grey sun-hours face colours when the parent is in B&W", () => {
    const geometry = new THREE.BufferGeometry();
    const rgb = sunHoursDirectRgb(4, 8);
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([...rgb, ...rgb, ...rgb]), 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, color: "#ff8800" }));
    mesh.userData.sunHoursFaces = true;
    const root = new THREE.Group();
    const road = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: "#c8a060" }));
    root.add(mesh, road);
    const rest = Array.from(geometry.getAttribute("color").array);
    applySolarGreyscale(root, true);
    expect(Array.from(geometry.getAttribute("color").array)).toEqual(rest);
    expect((mesh.material as THREE.MeshBasicMaterial).color.getHexString()).toBe("ff8800");
    expect((road.material as THREE.MeshBasicMaterial).color.r).toBe((road.material as THREE.MeshBasicMaterial).color.g);
  });
});
