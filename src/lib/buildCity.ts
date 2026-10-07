import * as THREE from "three";
import type { MultiPolygon } from "polygon-clipping";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BUILDING_EDGE_COLOR, BUILDING_EDGE_THRESHOLD_DEG } from "./buildingEdges";
import { BUILDING_USE_META, SOURCE_META, buildingLayerName, uniformBuildingColor } from "./buildingUse";
import { getColour } from "./colours";
import { DEFAULT_SITE_FRAME_SHAPE, SITE_FRAME_CIRCLE_SEGMENTS } from "./siteFrame";
import { buildTreeGroup } from "./treeMassing";
import { openRing, signedArea } from "./geo";
import { carriagewaysOf, unionCarriageways, unionPathRoads } from "./roadFill";
import { hexRgb, overlapLift, ROAD_COLOR, ROAD_RGB, roadGradeLayer, SURFACE } from "./surfaceLayers";
import { matteStandardMaterial } from "./matteMaterial";
import { isSiteBuilding } from "./siteBuildings";
import { siteBoundaryLineGeometry } from "./siteBoundaryDash3d";
import { footprintBase, sampleTerrain, terrainBuffers } from "./terrain";
import type { AreaFeat, BuildingFeat, BuildingUse, CityModel, Pt, Ring, RoadGrade, TerrainField } from "../types";

export type CityBuildOptions = {
  /** Viewport only. Exports keep one material, and one Rhino sublayer, per use. */
  uniformBuildings?: boolean;
  /** Viewport only. Recolour by typology source. Inferred tiers are hatched. */
  colourBySource?: boolean;
  /** One mesh per building so a Rhino object can carry use and typology_source. */
  splitBuildings?: boolean;
  /** Viewport only. Manual-height buildings render in the manual tint when on. */
  highlightManual?: boolean;
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

type MergeEntry = { geometry: THREE.BufferGeometry; buildingId: number };

function mergeMeshes(
  entries: MergeEntry[] | THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
): THREE.Object3D | null {
  const normalized: MergeEntry[] = entries.map((entry) =>
    entry instanceof THREE.BufferGeometry ? { geometry: entry, buildingId: -1 } : entry,
  );
  const usable = normalized.filter((entry) => entry.geometry.getAttribute("position"));
  if (usable.length === 0) return null;
  const trackBuildingIds = usable.some((entry) => entry.buildingId >= 0);
  try {
    const merged = mergeGeometries(
      usable.map((entry) => entry.geometry),
      trackBuildingIds,
    );
    if (!merged) throw new Error("empty merge");
    usable.forEach((entry) => entry.geometry.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    if (usable.some((entry) => entry.buildingId >= 0)) {
      mesh.userData.buildingIdByGroup = usable.map((entry) => entry.buildingId);
    }
    return mesh;
  } catch {
    const group = new THREE.Group();
    group.name = name;
    for (const entry of usable) {
      const child = new THREE.Mesh(entry.geometry, material);
      child.userData.buildingId = entry.buildingId;
      group.add(child);
    }
    return group;
  }
}

type Tri = [Pt, Pt, Pt];

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function midpoint(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
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

function splitTriangle(tri: Tri, maxEdge: number): Tri[] {
  const [a, b, c] = tri;
  const ab = distance(a, b) > maxEdge;
  const bc = distance(b, c) > maxEdge;
  const ca = distance(c, a) > maxEdge;
  const count = Number(ab) + Number(bc) + Number(ca);
  if (count === 0) return [tri];
  const mab = midpoint(a, b);
  const mbc = midpoint(b, c);
  const mca = midpoint(c, a);
  if (count === 3) return [[a, mab, mca], [mab, b, mbc], [mca, mbc, c], [mab, mbc, mca]];
  if (count === 1) {
    if (ab) return [[a, mab, c], [mab, b, c]];
    if (bc) return [[a, b, mbc], [a, mbc, c]];
    return [[a, b, mca], [mca, b, c]];
  }
  if (!ab) return [[a, b, mbc], [a, mbc, mca], [mca, mbc, c]];
  if (!bc) return [[a, mab, mca], [mab, b, c], [mab, c, mca]];
  return [[a, mab, c], [mab, mbc, c], [mab, b, mbc]];
}

function subdivideToSpacing(tris: Tri[], maxEdge: number): Tri[] {
  let current = tris;
  for (let level = 0; level < 8; level++) {
    const needsSplit = current.some(
      ([a, b, c]) => distance(a, b) > maxEdge || distance(b, c) > maxEdge || distance(c, a) > maxEdge,
    );
    if (!needsSplit) break;
    const next: Tri[] = [];
    for (const tri of current) next.push(...splitTriangle(tri, maxEdge));
    if (next.length > 24000) break;
    current = next;
  }
  return current;
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
    const geometry = drapedRingGeometry(polygon[0] as Ring, polygon.slice(1) as Ring[], sample, offset, spacing);
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
  const step = spacing ?? 12;
  return drapedMultiPolygonGeometry(multi, heightAt, lift, step);
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

/** Draped water keeps a small lift and polygon offset so lakes do not z-fight the terrain mesh. */
function drapedWaterLayer() {
  return {
    ...SURFACE.water,
    lift: SURFACE.water.lift + 0.035,
    polygonOffsetFactor: SURFACE.water.polygonOffsetFactor,
    polygonOffsetUnits: SURFACE.water.polygonOffsetUnits,
  };
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

function terrainMesh(field: TerrainField, sideM: number, frameShape = DEFAULT_SITE_FRAME_SHAPE): THREE.Mesh {
  const buffers = terrainBuffers(field, sideM, frameShape);
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

  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const sample = elevationAt(model);
  if (model.terrain) {
    group.add(terrainMesh(model.terrain, model.sideM, frameShape));
  } else {
    const groundGeo =
      frameShape === "circle"
        ? new THREE.CircleGeometry(model.sideM / 2, SITE_FRAME_CIRCLE_SEGMENTS)
        : new THREE.PlaneGeometry(model.sideM, model.sideM);
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
  const waterLayer = onTerrain ? drapedWaterLayer() : SURFACE.water;
  const waterMat = paint(matteStandardMaterial({ color: getColour("--water-3d") }), waterLayer);
  const greenGeos: THREE.BufferGeometry[] = [];
  const waterGeos: THREE.BufferGeometry[] = [];
  for (let index = 0; index < model.areas.length; index++) {
    const area = model.areas[index];
    const lift =
      (area.kind === "water" ? waterLayer.lift : SURFACE.green.lift) + overlapLift(index);
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
  const drapeSpacing = model.terrain ? Math.min(model.terrain.spacingM, 8) : undefined;
  const grades: RoadGrade[] = ["path", "local", "arterial"];
  for (const grade of grades) {
    const layer = roadGradeLayer(grade);
    const fill =
      grade === "path"
        ? unionPathRoads(
            model.roads
              .filter((road) => road.kind === "road" && road.grade === "path")
              .map((road) => ({ line: road.line, width: road.width })),
            model.sideM,
            frameShape,
          )
        : unionCarriageways(
            carriagewaysOf(model.roads.filter((road) => (road.grade ?? "local") === grade)),
            model.sideM,
            frameShape,
          );
    const geometry = roadFillGeometry(fill.polygons, layer.lift, sample, drapeSpacing);
    if (!geometry) continue;
    const material = paint(matteStandardMaterial({ color: ROAD_COLOR[grade] }), layer);
    material.name = "Roads";
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Roads";
    mesh.userData.layerColor = ROAD_RGB.arterial;
    mesh.userData.objectColor = ROAD_RGB[grade];
    order(mesh, layer.renderOrder);
    group.add(mesh);
  }
  const railFill = unionCarriageways(
    model.roads.filter((road) => road.kind === "rail").map((road) => ({ line: road.line, width: road.width })),
    model.sideM,
    frameShape,
  );
  const railGeo = roadFillGeometry(railFill.polygons, SURFACE.rail.lift, sample, drapeSpacing);
  if (railGeo) {
    const mesh = new THREE.Mesh(railGeo, railMat);
    mesh.name = "Rail";
    order(mesh, SURFACE.rail.renderOrder);
    group.add(mesh);
  }

  const siteFill = getColour("--site-building");
  const siteLayerName = "Buildings::Site";
  const bySource = Boolean(options.colourBySource) && !options.splitBuildings;
  const uniform = Boolean(options.uniformBuildings) && !bySource && !options.splitBuildings;
  if (options.splitBuildings) {
    for (const building of model.buildings) {
      const base = (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
      const geometries = extrudeFootprint(building, base);
      const onSite = isSiteBuilding(model, building.id);
      const name = onSite ? siteLayerName : buildingLayerName(building.use);
      const color = onSite ? siteFill : BUILDING_USE_META[building.use].color;
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
    const buckets = new Map<string, MergeEntry[]>();
    const bucketName = (building: BuildingFeat) => {
      if (bySource) return `source:${building.source}`;
      if (uniform) return "Buildings";
      return buildingLayerName(building.use);
    };
    const manualColor = getColour("--building-manual");
    const manualMat = paint(matteStandardMaterial({ color: manualColor }), SURFACE.building);
    manualMat.name = "Buildings-manual";
    const siteMat = paint(matteStandardMaterial({ color: siteFill }), SURFACE.building);
    siteMat.name = "Buildings-site";
    for (const building of model.buildings) {
      const base = (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
      const geometries = extrudeFootprint(building, base);
      if (options.highlightManual && building.heightManual) {
        for (const geometry of geometries) {
          const mesh = new THREE.Mesh(geometry, manualMat);
          mesh.name = "Buildings-manual";
          mesh.userData.buildingId = building.id;
          mesh.userData.layerColor = hexRgb(manualColor);
          order(mesh, SURFACE.building.renderOrder);
          group.add(mesh);
        }
        continue;
      }
      if (isSiteBuilding(model, building.id)) {
        for (const geometry of geometries) {
          const mesh = new THREE.Mesh(geometry, siteMat);
          mesh.name = "Buildings-site";
          mesh.userData.buildingId = building.id;
          mesh.userData.layerColor = hexRgb(siteFill);
          order(mesh, SURFACE.building.renderOrder);
          group.add(mesh);
        }
        continue;
      }
      for (const geometry of geometries) {
        const name = bucketName(building);
        const entry = { geometry, buildingId: building.id };
        const list = buckets.get(name);
        if (list) list.push(entry);
        else buckets.set(name, [entry]);
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

  if (model.layers.trees) {
    const trees = buildTreeGroup(model.trees, sample ?? undefined);
    if (trees) group.add(trees);
  }

  const boundaryLines = model.siteBoundaryLines;
  if (boundaryLines && boundaryLines.length > 0) {
    const stroke = getColour("--site-boundary");
    const sampleZ = (east: number, north: number) => (sample ? sample(east, north) : 0);
    const geometry = siteBoundaryLineGeometry(boundaryLines, model.sideM, sampleZ);
    if (geometry) {
      const material = new THREE.LineBasicMaterial({ color: stroke });
      material.name = "Site::Boundary";
      const linesMesh = new THREE.LineSegments(geometry, material);
      linesMesh.name = "Site::Boundary";
      order(linesMesh, SURFACE.building.renderOrder + 1);
      group.add(linesMesh);
    }
  }

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

/** Viewport opacity when a building is selected (3D pick, height edit, or QA). */
export const SELECTED_BUILDING_FILL_OPACITY = 0.5;

const HEIGHT_EDIT_FILL_OPACITY = SELECTED_BUILDING_FILL_OPACITY;

export const HEIGHT_EDIT_EDGE_DASH_M = 2;
export const HEIGHT_EDIT_EDGE_GAP_M = 1.5;

/** Draw after the merged city so the selection overlay is never sorted behind it. */
export const SELECTION_OVERLAY_RENDER_ORDER = SURFACE.building.renderOrder + 120;

/** Viewport-only clone for the building being height-edited; does not touch shared city materials. */
export function buildHeightEditOverlay(
  model: CityModel,
  buildingId: number,
  fillColor: string,
): THREE.Group | null {
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building) return null;
  const group = new THREE.Group();
  group.name = "HeightEditOverlay";
  const base =
    (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
  const geometries = extrudeFootprint(building, base);
  const fillMaterial = matteStandardMaterial({
    color: fillColor,
    transparent: true,
    opacity: HEIGHT_EDIT_FILL_OPACITY,
    depthWrite: false,
  });
  fillMaterial.toneMapped = false;
  fillMaterial.depthTest = true;
  fillMaterial.polygonOffset = false;
  const edgeMaterial = new THREE.LineDashedMaterial({
    color: BUILDING_EDGE_COLOR,
    dashSize: HEIGHT_EDIT_EDGE_DASH_M,
    gapSize: HEIGHT_EDIT_EDGE_GAP_M,
    scale: 1,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  for (const geometry of geometries) {
    const mesh = new THREE.Mesh(geometry, fillMaterial);
    mesh.renderOrder = SELECTION_OVERLAY_RENDER_ORDER;
    group.add(mesh);
    const edges = new THREE.EdgesGeometry(geometry, BUILDING_EDGE_THRESHOLD_DEG);
    const lines = new THREE.LineSegments(edges, edgeMaterial);
    lines.computeLineDistances();
    lines.renderOrder = SELECTION_OVERLAY_RENDER_ORDER + 1;
    group.add(lines);
  }
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
