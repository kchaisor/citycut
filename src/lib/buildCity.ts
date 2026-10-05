import * as THREE from "three";
import type { MultiPolygon } from "polygon-clipping";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BUILDING_USE_META, SOURCE_META, buildingLayerName, uniformBuildingColor } from "./buildingUse";
import { getColour } from "./colours";
import { buildTreeGroup } from "./treeMassing";
import { openRing, signedArea } from "./geo";
import { carriagewaysOf, unionCarriageways, unionPathRoads } from "./roadFill";
import { hexRgb, overlapLift, ROAD_COLOR, ROAD_RGB, roadGradeLayer, SURFACE } from "./surfaceLayers";
import { matteStandardMaterial } from "./matteMaterial";
import { BRIDGE_DECK_CLEARANCE_M, subdivideToSpacing, type Tri } from "./roadDrape";
import { footprintBase, sampleTerrain, terrainBuffers } from "./terrain";
import type { AreaFeat, BuildingFeat, BuildingUse, CityModel, Pt, Ring, RoadGrade, TerrainField } from "../types";

export type CityBuildOptions = {
  /** Viewport only. Exports keep one material, and one Rhino sublayer, per use. */
  uniformBuildings?: boolean;
  /** Viewport only. Recolour by typology source. Inferred tiers are hatched. */
  colourBySource?: boolean;
  /** One mesh per building so a Rhino object can carry use and typology_source. */
  splitBuildings?: boolean;
};

function orient(ring: Ring, ccw: boolean): Pt[] {
  const points = openRing(ring);
  if (points.length < 3) return points;
  const positive = signedArea(points) > 0;
  if (positive !== ccw) points.reverse();
  return points;
}

function shapeFromRing(outer: Ring, holes: Ring[]): THREE.Shape | null {
  const contour = orient(outer, true);
  if (contour.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(contour[0][0], contour[0][1]);
  for (let i = 1; i < contour.length; i++) shape.lineTo(contour[i][0], contour[i][1]);
  shape.closePath();
  for (const hole of holes) {
    const inner = orient(hole, false);
    if (inner.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(inner[0][0], inner[0][1]);
    for (let i = 1; i < inner.length; i++) path.lineTo(inner[i][0], inner[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

function layFlat(geometry: THREE.BufferGeometry, y: number): THREE.BufferGeometry {
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  geometry.clearGroups();
  geometry.computeVertexNormals();
  return geometry;
}

function mergeMeshes(
  geometries: THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
): THREE.Object3D | null {
  const usable = geometries.filter((geometry) => geometry.getAttribute("position"));
  if (usable.length === 0) return null;
  try {
    const merged = mergeGeometries(usable, false);
    if (!merged) throw new Error("empty merge");
    usable.forEach((geometry) => geometry.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    return mesh;
  } catch {
    const group = new THREE.Group();
    group.name = name;
    for (const geometry of usable) group.add(new THREE.Mesh(geometry, material));
    return group;
  }
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function trianglesFromShape(geometry: THREE.BufferGeometry): Tri[] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const at = (vertex: number): Pt => [position.getX(vertex), position.getY(vertex)];
  const tris: Tri[] = [];
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      tris.push([at(index.getX(i)), at(index.getX(i + 1)), at(index.getX(i + 2))]);
    }
  } else {
    for (let i = 0; i + 2 < position.count; i += 3) tris.push([at(i), at(i + 1), at(i + 2)]);
  }
  return tris;
}

function drapedRingGeometry(
  outer: Ring,
  holes: Ring[],
  sample: (east: number, north: number) => number,
  offset: number,
  spacing: number,
): THREE.BufferGeometry | null {
  const area: AreaFeat = { id: -1, kind: "green", ring: outer, holes };
  return drapedAreaGeometry(area, sample, offset, spacing);
}

/** Unioned road or path fill, draped on the terrain heightfield. */
export function drapedMultiPolygonGeometry(
  multi: MultiPolygon,
  sample: (east: number, north: number) => number,
  offset: number,
  spacing: number,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const polygon of multi) {
    if (polygon.length === 0) continue;
    const geometry = drapedRingGeometry(
      polygon[0] as Ring,
      polygon.slice(1) as Ring[],
      sample,
      offset,
      spacing,
    );
    if (geometry) parts.push(geometry);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  merged?.computeVertexNormals();
  return merged;
}

function roadFillGeometry(
  multi: MultiPolygon,
  lift: number,
  sample: ((east: number, north: number) => number) | null,
  spacing: number | undefined,
): THREE.BufferGeometry | null {
  if (multi.length === 0) return null;
  const heightAt = sample ?? (() => 0);
  const step = spacing ?? 8;
  return drapedMultiPolygonGeometry(multi, heightAt, lift, step);
}

function deckHeightForRing(ring: Ring, sample: (east: number, north: number) => number): number {
  let max = -Infinity;
  for (const point of ring) max = Math.max(max, sample(point[0], point[1]));
  return max;
}

/** Flat bridge/overpass decks sit above the terrain under the fill. */
export function deckMultiPolygonGeometry(
  multi: MultiPolygon,
  sample: (east: number, north: number) => number,
  lift: number,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const polygon of multi) {
    if (polygon.length === 0) continue;
    const outer = polygon[0] as Ring;
    const holes = polygon.slice(1) as Ring[];
    let deckBase = deckHeightForRing(outer, sample);
    for (const hole of holes) deckBase = Math.max(deckBase, deckHeightForRing(hole, sample));
    const shape = shapeFromRing(outer, holes);
    if (!shape) continue;
    try {
      parts.push(layFlat(new THREE.ShapeGeometry(shape), deckBase + BRIDGE_DECK_CLEARANCE_M + lift));
    } catch {
      /* skip broken deck polygon */
    }
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  merged?.computeVertexNormals();
  return merged;
}

/** Parks and water keep their outline and pick up interior samples so they follow the heightfield. */
export function drapedAreaGeometry(
  area: AreaFeat,
  sample: (east: number, north: number) => number,
  offset: number,
  spacing: number,
): THREE.BufferGeometry | null {
  const shape = shapeFromRing(area.ring, area.holes);
  if (!shape) return null;
  let flat: THREE.BufferGeometry;
  try {
    flat = new THREE.ShapeGeometry(shape);
  } catch {
    return null;
  }
  const fine = subdivideToSpacing(trianglesFromShape(flat), Math.max(spacing, 4));
  flat.dispose();
  const positions: number[] = [];
  for (const [a, b, c] of fine) {
    const span = distance(a, b) + distance(b, c) + distance(c, a);
    if (span < 0.05) continue;
    for (const point of [a, b, c]) {
      positions.push(point[0], sample(point[0], point[1]) + offset, -point[1]);
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const stripeMaps = new Map<string, THREE.CanvasTexture | null>();

/** Diagonal stripes so a zone colour reads as a guess. */
function inferredStripeMap(): THREE.CanvasTexture | null {
  const paper = getColour("--hatch-paper");
  const ink = getColour("--hatch-ink");
  const key = `${paper}|${ink}`;
  const cached = stripeMaps.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") {
    stripeMaps.set(key, null);
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    stripeMaps.set(key, null);
    return null;
  }
  context.fillStyle = paper;
  context.fillRect(0, 0, 64, 64);
  context.strokeStyle = ink;
  context.lineWidth = 7;
  context.beginPath();
  for (let offset = -64; offset <= 64; offset += 16) {
    context.moveTo(offset, 64);
    context.lineTo(offset + 64, 0);
  }
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  stripeMaps.set(key, texture);
  return texture;
}

function paint(material: THREE.MeshStandardMaterial, layer: { polygonOffsetFactor: number; polygonOffsetUnits: number }) {
  if (layer.polygonOffsetFactor === 0 && layer.polygonOffsetUnits === 0) return material;
  material.polygonOffset = true;
  material.polygonOffsetFactor = layer.polygonOffsetFactor;
  material.polygonOffsetUnits = layer.polygonOffsetUnits;
  return material;
}

/** Draped fills already sit above the heightfield; negative offset pulls them through the terrain. */
function drapeLayer(layer: { lift: number; polygonOffsetFactor: number; polygonOffsetUnits: number; renderOrder: number }) {
  return { ...layer, polygonOffsetFactor: 0, polygonOffsetUnits: 0 };
}

function extrudeShape(shape: THREE.Shape, height: number, base: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  return layFlat(geometry, base);
}

function extrudePart(ring: Ring, holes: Ring[], height: number, base: number): THREE.BufferGeometry | null {
  const shape = shapeFromRing(ring, holes);
  if (!shape) return null;
  try {
    return extrudeShape(shape, height, base);
  } catch {
    const fallback = shapeFromRing(ring, []);
    if (!fallback) return null;
    try {
      return extrudeShape(fallback, height, base);
    } catch {
      return null;
    }
  }
}

function extrudeFootprint(building: BuildingFeat, base: number): THREE.BufferGeometry[] {
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

function order(object: THREE.Object3D, renderOrder: number) {
  object.renderOrder = renderOrder;
  object.traverse((child) => {
    child.renderOrder = renderOrder;
  });
}

function terrainMesh(field: TerrainField, sideM: number): THREE.Mesh {
  const buffers = terrainBuffers(field, sideM);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  geometry.computeVertexNormals();
  const material = paint(
    matteStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    SURFACE.terrain,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Terrain";
  order(mesh, SURFACE.terrain.renderOrder);
  return mesh;
}

function elevationAt(model: CityModel): ((east: number, north: number) => number) | null {
  const field = model.terrain;
  if (!field) return null;
  return (east, north) => sampleTerrain(field, east, north, model.sideM);
}

export function buildCityGroup(model: CityModel, options: CityBuildOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = "CityCut";
  group.userData = {
    generator: "CityCut",
    center: model.center,
    sideM: model.sideM,
  };

  const sample = elevationAt(model);
  if (model.terrain) {
    group.add(terrainMesh(model.terrain, model.sideM));
  } else {
    const groundGeo = new THREE.PlaneGeometry(model.sideM, model.sideM);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = paint(
      matteStandardMaterial({
        color: getColour("--ground-fill"),
        side: THREE.DoubleSide,
      }),
      SURFACE.ground,
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.name = "Ground";
    order(ground, SURFACE.ground.renderOrder);
    group.add(ground);
  }

  const onTerrain = Boolean(sample && model.terrain);
  const greenMat = paint(
    matteStandardMaterial({ color: getColour("--green-3d") }),
    onTerrain ? drapeLayer(SURFACE.green) : SURFACE.green,
  );
  const waterMat = paint(
    matteStandardMaterial({ color: getColour("--water-3d") }),
    onTerrain ? drapeLayer(SURFACE.water) : SURFACE.water,
  );
  const greenGeos: THREE.BufferGeometry[] = [];
  const waterGeos: THREE.BufferGeometry[] = [];
  for (let index = 0; index < model.areas.length; index++) {
    const area = model.areas[index];
    const lift =
      (area.kind === "water" ? SURFACE.water.lift : SURFACE.green.lift) + overlapLift(index);
    if (sample && model.terrain) {
      try {
        const drapeSpacing =
          area.kind === "water" ? Math.min(model.terrain.spacingM, 3) : model.terrain.spacingM;
        const geometry = drapedAreaGeometry(
          area,
          sample,
          lift,
          drapeSpacing,
        );
        if (!geometry) continue;
        if (area.kind === "water") waterGeos.push(geometry);
        else greenGeos.push(geometry);
      } catch {
        /* Skip a broken polygon rather than failing the whole block. */
      }
      continue;
    }
    const shape = shapeFromRing(area.ring, area.holes);
    if (!shape) continue;
    try {
      const geometry = layFlat(new THREE.ShapeGeometry(shape), lift);
      if (area.kind === "water") waterGeos.push(geometry);
      else greenGeos.push(geometry);
    } catch {
      /* Skip a broken polygon rather than failing the whole block. */
    }
  }
  const green = mergeMeshes(greenGeos, greenMat, "Green");
  const water = mergeMeshes(waterGeos, waterMat, "Water");
  if (green) {
    order(green, SURFACE.green.renderOrder);
    group.add(green);
  }
  if (water) {
    order(water, SURFACE.water.renderOrder);
    group.add(water);
  }

  const railMat = paint(matteStandardMaterial({ color: getColour("--rail-fill") }), SURFACE.rail);
  const drapeSpacing = model.terrain ? Math.min(model.terrain.spacingM, 5) : undefined;
  const grades: RoadGrade[] = ["path", "local", "arterial"];
  for (const grade of grades) {
    const layer = roadGradeLayer(grade);
    const gradeRoads = model.roads.filter((road) => (road.grade ?? "local") === grade);
    const fill =
      grade === "path"
        ? unionPathRoads(
            gradeRoads
              .filter((road) => road.kind === "road" && !road.deck)
              .map((road) => ({ line: road.line, width: road.width })),
            model.sideM,
          )
        : unionCarriageways(carriagewaysOf(gradeRoads, "ground"), model.sideM);
    const geometry = roadFillGeometry(fill.polygons, layer.lift, sample, drapeSpacing);
    const deckFill = unionCarriageways(carriagewaysOf(gradeRoads, "deck"), model.sideM);
    const deckGeo =
      sample && deckFill.polygons.length > 0
        ? deckMultiPolygonGeometry(deckFill.polygons, sample, layer.lift)
        : null;
    if (!geometry && !deckGeo) continue;
    const material = paint(matteStandardMaterial({ color: ROAD_COLOR[grade] }), layer);
    material.name = "Roads";
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "Roads";
      mesh.userData.layerColor = ROAD_RGB.arterial;
      mesh.userData.objectColor = ROAD_RGB[grade];
      order(mesh, layer.renderOrder);
      group.add(mesh);
    }
    if (deckGeo) {
      const deckMesh = new THREE.Mesh(deckGeo, material);
      deckMesh.name = "Roads";
      deckMesh.userData.layerColor = ROAD_RGB.arterial;
      deckMesh.userData.objectColor = ROAD_RGB[grade];
      order(deckMesh, layer.renderOrder + 0.1);
      group.add(deckMesh);
    }
  }
  const railFill = unionCarriageways(
    model.roads.filter((road) => road.kind === "rail").map((road) => ({ line: road.line, width: road.width })),
    model.sideM,
  );
  const railGeo = roadFillGeometry(railFill.polygons, SURFACE.rail.lift, sample, drapeSpacing);
  if (railGeo) {
    const mesh = new THREE.Mesh(railGeo, railMat);
    mesh.name = "Rail";
    order(mesh, SURFACE.rail.renderOrder);
    group.add(mesh);
  }

  const bySource = Boolean(options.colourBySource) && !options.splitBuildings;
  const uniform = Boolean(options.uniformBuildings) && !bySource && !options.splitBuildings;
  if (options.splitBuildings) {
    for (const building of model.buildings) {
      const base = (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
      const geometries = extrudeFootprint(building, base);
      const name = buildingLayerName(building.use);
      const color = BUILDING_USE_META[building.use].color;
      const material = paint(matteStandardMaterial({ color }), SURFACE.building);
      material.name = name;
      for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.userData.layerColor = hexRgb(color);
        mesh.userData.use = building.use;
        mesh.userData.typologySource = building.source;
        mesh.userData.buildingId = building.id;
        order(mesh, SURFACE.building.renderOrder);
        group.add(mesh);
      }
    }
  } else {
    const buckets = new Map<string, THREE.BufferGeometry[]>();
    const bucketName = (building: BuildingFeat) => {
      if (bySource) return `source:${building.source}`;
      if (uniform) return "Buildings";
      return buildingLayerName(building.use);
    };
    for (const building of model.buildings) {
      const base = (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
      for (const geometry of extrudeFootprint(building, base)) {
        const name = bucketName(building);
        const list = buckets.get(name);
        if (list) list.push(geometry);
        else buckets.set(name, [geometry]);
      }
    }
    for (const [name, geometries] of buckets) {
      const sourceKey = name.startsWith("source:") ? name.slice("source:".length) : "";
      const sourceMeta = bySource ? SOURCE_META[sourceKey as keyof typeof SOURCE_META] : undefined;
      const use = (Object.keys(BUILDING_USE_META) as BuildingUse[]).find(
        (key) => buildingLayerName(key) === name,
      );
      const color = sourceMeta?.color ?? (uniform || !use ? uniformBuildingColor() : BUILDING_USE_META[use].color);
      const material = paint(matteStandardMaterial({ color }), SURFACE.building);
      if (sourceMeta?.inferred) {
        const map = inferredStripeMap();
        if (map) material.map = map;
      }
      material.name = name;
      const buildings = mergeMeshes(geometries, material, name);
      if (!buildings) continue;
      const layerColor = use && !uniform ? hexRgb(BUILDING_USE_META[use].color) : undefined;
      if (layerColor) {
        buildings.traverse((child) => {
          child.userData.layerColor = layerColor;
        });
      }
      order(buildings, SURFACE.building.renderOrder);
      group.add(buildings);
    }
  }

  const trees = buildTreeGroup(model.trees, sample ?? undefined);
  if (trees) group.add(trees);

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    // A merge that falls back to a group leaves the child meshes unnamed.
    const name = mesh.name || mesh.parent?.name || "";
    const instanced = mesh as THREE.InstancedMesh;
    const building = name.startsWith("Buildings") || name.startsWith("source:");
    const tree = name === "Trees" || instanced.isInstancedMesh;
    mesh.castShadow = building || tree;
    mesh.receiveShadow = !tree;
  });

  return group;
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}
