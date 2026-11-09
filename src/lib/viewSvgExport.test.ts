import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import { clearPlanShadowCache } from "./buildingShadows";
import { viewChunks, viewLayerOrder, viewSvg } from "./aiView";
import { shotFromCamera } from "./cameraShot";
import type { CityModel, Pt, TerrainField } from "../types";

function square(minX: number, minY: number, maxX: number, maxY: number): Pt[] {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function testModel(): CityModel {
  const terrain: TerrainField = {
    cols: 3,
    rows: 3,
    heights: Float32Array.of(0, 1, 2, 0.4, 1.2, 2.2, 0.2, 1.1, 2.4),
    min: 0,
    max: 2.4,
    spacingM: 50,
    zoom: 14,
    metresPerPixel: 8,
    source: "Mapterhorn",
  };
  return {
    placeLabel: "Test Block",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: square(-20, -20, 20, 20),
        holes: [square(-5, -5, 5, 5)],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
    ],
    roads: [{ id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" }],
    areas: [{ id: 3, ring: square(-45, -45, -30, -30), holes: [], kind: "green" }],
    trees: [],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "© OpenStreetMap contributors",
    terrain,
    contours: true,
  };
}

function testShot() {
  const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.5, 4000);
  camera.position.set(-90, 80, 110);
  camera.lookAt(0, 6, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return shotFromCamera(camera, 640, 400);
}

describe("3D view SVG export", () => {
  beforeEach(() => clearPlanShadowCache());

  it("includes sun path and shadow layers when solar options are on, and omits them when off", async () => {
    const m = testModel();
    const solarOn = {
      heliodon: {
        lat: m.center.lat,
        lon: m.center.lon,
        year: 2026,
        month: 6,
        day: 21,
        hour: 15,
        minute: 0,
        sideM: m.sideM,
        radiusFactor: 1.75,
      },
      shadows: {
        lat: m.center.lat,
        lon: m.center.lon,
        year: 2026,
        month: 6,
        day: 21,
        hour: 15,
        minute: 0,
      },
      castShadows: true,
      groundY: 0,
    };
    const shot = testShot();
    const withSolar = await viewSvg(m, shot, { uniformBuildings: false, colourBySource: false, solarDiagramOn: true }, solarOn);
    expect(withSolar).toContain('inkscape:label="Sun path"');
    expect(withSolar).toContain('inkscape:label="Shadows"');
    expect(withSolar).toMatch(/Jun 21|15h/);
    const without = await viewSvg(m, testShot(), { uniformBuildings: false, colourBySource: false });
    expect(without).not.toContain('inkscape:label="Sun path"');
  });

  it("orders shadow vector chunks before buildings in the layer stack", () => {
    const m = testModel();
    const chunks = viewChunks(
      m,
      testShot(),
      { uniformBuildings: false, colourBySource: false, solarDiagramOn: true },
      {
        shadows: {
          lat: m.center.lat,
          lon: m.center.lon,
          year: 2026,
          month: 9,
          day: 22,
          hour: 12,
          minute: 0,
        },
        castShadows: true,
        groundY: 0,
      },
    );
    expect(chunks.some((chunk) => chunk.name === "Shadows")).toBe(true);
    const order = viewLayerOrder(chunks);
    expect(order.indexOf("Shadows")).toBeLessThan(order.indexOf("Buildings"));
  });
});
