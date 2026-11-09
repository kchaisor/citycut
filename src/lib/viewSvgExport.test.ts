import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import { clearPlanShadowCache } from "./buildingShadows";
import { viewChunks, viewLayerOrder, viewSvg } from "./aiView";
import { shotFromCamera } from "./cameraShot";
import { heliodonRadiusM } from "./heliodonRadius";
import { heliodonSceneBounds, siteBounds, unionAabb } from "./heliodonFraming";
import {
  eyeDistance,
  fitOrthoZoom,
  frameCentre,
  isoEye,
  isoOffset,
  ISO_CAMERA_UP,
  orthoNearFar,
  type IsoCorner,
} from "./isoCamera";
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

function spreadBuildings(): CityModel["buildings"] {
  const blocks: CityModel["buildings"] = [];
  let id = 1;
  for (let east = -350; east <= 350; east += 140) {
    for (let north = -350; north <= 350; north += 140) {
      if (Math.hypot(east, north) < 120) continue;
      const half = 35;
      blocks.push({
        id: id++,
        ring: square(east - half, north - half, east + half, north + half),
        holes: [],
        height: 8 + ((id * 7) % 25),
        use: id % 3 === 0 ? "commercial" : "residential",
        source: "osm_tag",
      });
    }
  }
  return blocks;
}

function kilometreSiteModel(): CityModel {
  const terrain: TerrainField = {
    cols: 5,
    rows: 5,
    heights: Float32Array.of(0, 2, 4, 2, 0, 1, 3, 5, 3, 1, 0, 2, 4, 2, 0, 1, 3, 5, 3, 1, 0, 2, 4, 2, 0),
    min: 0,
    max: 5,
    spacingM: 250,
    zoom: 14,
    metresPerPixel: 8,
    source: "Mapterhorn",
  };
  return {
    placeLabel: "Rodd Point NSW",
    center: { lon: 151.18355, lat: -33.866498 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: spreadBuildings(),
    roads: [{ id: 900, line: [[-480, 0], [480, 0]], width: 10, kind: "road", grade: "arterial" }],
    areas: [
      { id: 901, ring: square(200, -450, 480, -180), holes: [], kind: "water" },
      { id: 902, ring: square(-480, -480, -200, -200), holes: [], kind: "green" },
    ],
    trees: [],
    roadKm: 0.96,
    buildingCapHit: false,
    sourceNote: "© OpenStreetMap contributors",
    terrain,
    contours: true,
  };
}

function isoSiteFramingShot(
  model: CityModel,
  corner: IsoCorner,
  width: number,
  height: number,
  solar: {
    lat: number;
    lon: number;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    radiusFactor: number;
  },
) {
  const groundY = model.terrain?.min ?? 0;
  const siteTopY = 80;
  const site = siteBounds(model.sideM, groundY, siteTopY);
  const ring = heliodonRadiusM(model.sideM, solar.radiusFactor);
  const heliodon = heliodonSceneBounds({
    ...solar,
    sideM: model.sideM,
    ringRadiusM: ring,
    groundY,
    siteTopY,
  });
  const clipBounds = unionAabb(site, heliodon);
  const centre = frameCentre(site);
  const direction = isoOffset(corner);
  const distance = eyeDistance(site);
  const eye = isoEye(centre, corner, distance);
  const planes = orthoNearFar(clipBounds, eye, centre);
  const camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, planes.near, planes.far);
  camera.up.set(ISO_CAMERA_UP[0], ISO_CAMERA_UP[1], ISO_CAMERA_UP[2]);
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.zoom = fitOrthoZoom(site, direction, width, height);
  camera.lookAt(centre[0], centre[1], centre[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return shotFromCamera(camera, width, height);
}

function sunPathInViewBoxRatio(svg: string): number {
  const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!view) return 0;
  const w = Number(view[1]);
  const h = Number(view[2]);
  const layerStart = svg.indexOf('inkscape:label="Sun path"');
  if (layerStart < 0) return 0;
  const layerEnd = svg.indexOf("</g>", layerStart);
  const layer = svg.slice(layerStart, layerEnd);
  const coords = [...layer.matchAll(/(?:^|[\s,ML])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/gm)].map((m) => [Number(m[1]), Number(m[2])]);
  if (!coords.length) return 0;
  let inView = 0;
  for (const [x, y] of coords) {
    if (x >= 0 && x <= w && y >= 0 && y <= h) inView += 1;
  }
  return inView / coords.length;
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
    const without = await viewSvg(m, testShot(), { uniformBuildings: false, colourBySource: false, solarDiagramOn: false });
    expect(without).not.toContain('inkscape:label="Sun path"');

    const domeOff = await viewSvg(
      m,
      shot,
      { uniformBuildings: false, colourBySource: false, solarDiagramOn: false },
      { ...solarOn, heliodon: null },
    );
    expect(domeOff).not.toContain('inkscape:label="Sun path"');
  });

  it("keeps most sun-path geometry in the viewBox for a 1 km iso site-framing export", async () => {
    const m = kilometreSiteModel();
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
    const shot = isoSiteFramingShot(m, "se", 640, 400, {
      lat: m.center.lat,
      lon: m.center.lon,
      year: 2026,
      month: 6,
      day: 21,
      hour: 15,
      minute: 0,
      radiusFactor: 1.75,
    });
    const svg = await viewSvg(m, shot, { uniformBuildings: false, colourBySource: false, solarDiagramOn: true }, solarOn);
    const ratio = sunPathInViewBoxRatio(svg);
    expect(ratio).toBeGreaterThan(0.35);
    expect(svg).toMatch(/<text[^>]*>N<\/text>/);
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
