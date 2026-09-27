import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildTreeGroup } from "./treeArchetypes";
import { openRing, signedArea } from "./geo";
import { footprintBase, sampleTerrain, terrainBuffers } from "./terrain";
import type { AreaFeat, CityModel, Pt, Ring, TerrainField } from "../types";

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

function ribbonPositions(
  line: Pt[],
  width: number,
  y: number,
  heightAt?: (east: number, north: number) => number,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.2) continue;
    const px = (-dy / length) * (width / 2);
    const py = (dx / length) * (width / 2);
    const lift = (east: number, north: number) => (heightAt ? heightAt(east, north) + y : y);
    const corner = (east: number, north: number): [number, number, number] => [
      east,
      lift(east, north),
      -north,
    ];
    const aL = corner(a[0] + px, a[1] + py);
    const aR = corner(a[0] - px, a[1] - py);
    const bL = corner(b[0] + px, b[1] + py);
    const bR = corner(b[0] - px, b[1] - py);
    positions.push(...aL, ...bL, ...bR, ...aL, ...bR, ...aR);
  }
  return positions;
}

function densifyLine(line: Pt[], maxLen: number): Pt[] {
  if (line.length < 2) return line;
  const out: Pt[] = [line[0]];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / maxLen));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function ribbonGeometry(
  lines: { line: Pt[]; width: number }[],
  y: number,
  heightAt?: (east: number, north: number) => number,
  maxSegment?: number,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  for (const item of lines) {
    const line = heightAt && maxSegment ? densifyLine(item.line, maxSegment) : item.line;
    positions.push(...ribbonPositions(line, item.width, y, heightAt));
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
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

/** Parks and water keep their outline and pick up interior samples so they follow the heightfield. */
function drapedAreaGeometry(
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

function terrainMesh(field: TerrainField, sideM: number): THREE.Mesh {
  const buffers = terrainBuffers(field, sideM);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Terrain";
  return mesh;
}

function elevationAt(model: CityModel): ((east: number, north: number) => number) | null {
  const field = model.terrain;
  if (!field) return null;
  return (east, north) => sampleTerrain(field, east, north, model.sideM);
}

export function buildCityGroup(model: CityModel): THREE.Group {
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
    const slabGeo = new THREE.BoxGeometry(model.sideM, 8, model.sideM);
    const sideMat = new THREE.MeshStandardMaterial({ color: "#c9c0b0", roughness: 0.92 });
    const topMat = new THREE.MeshStandardMaterial({ color: "#e6e0d4", roughness: 0.95 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: "#b7ad9e", roughness: 1 });
    const slab = new THREE.Mesh(slabGeo, [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat]);
    slab.position.y = -4;
    slab.name = "Ground";
    group.add(slab);
  }

  const greenMat = new THREE.MeshStandardMaterial({ color: "#7f9a62", roughness: 1 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: "#8ebfc8",
    roughness: 0.35,
    metalness: 0.04,
  });
  const greenGeos: THREE.BufferGeometry[] = [];
  const waterGeos: THREE.BufferGeometry[] = [];
  for (const area of model.areas) {
    if (sample && model.terrain) {
      try {
        const geometry = drapedAreaGeometry(
          area,
          sample,
          area.kind === "water" ? 0.08 : 0.04,
          model.terrain.spacingM,
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
      const geometry = layFlat(new THREE.ShapeGeometry(shape), area.kind === "water" ? 0.08 : 0.04);
      if (area.kind === "water") waterGeos.push(geometry);
      else greenGeos.push(geometry);
    } catch {
      /* Skip a broken polygon rather than failing the whole block. */
    }
  }
  const green = mergeMeshes(greenGeos, greenMat, "Green");
  const water = mergeMeshes(waterGeos, waterMat, "Water");
  if (green) group.add(green);
  if (water) group.add(water);

  const roadMat = new THREE.MeshStandardMaterial({ color: "#4e4943", roughness: 0.95 });
  const railMat = new THREE.MeshStandardMaterial({ color: "#8d6244", roughness: 0.8 });
  if (sample) {
    roadMat.polygonOffset = true;
    roadMat.polygonOffsetFactor = -1;
    roadMat.polygonOffsetUnits = -4;
    railMat.polygonOffset = true;
    railMat.polygonOffsetFactor = -1;
    railMat.polygonOffsetUnits = -4;
  }
  const segment = model.terrain?.spacingM;
  const roadGeo = ribbonGeometry(
    model.roads.filter((road) => road.kind === "road"),
    0.12,
    sample ?? undefined,
    segment,
  );
  const railGeo = ribbonGeometry(
    model.roads.filter((road) => road.kind === "rail"),
    0.18,
    sample ?? undefined,
    segment,
  );
  if (roadGeo) {
    const mesh = new THREE.Mesh(roadGeo, roadMat);
    mesh.name = "Roads";
    group.add(mesh);
  }
  if (railGeo) {
    const mesh = new THREE.Mesh(railGeo, railMat);
    mesh.name = "Rail";
    group.add(mesh);
  }

  const buildingMat = new THREE.MeshStandardMaterial({ color: "#f6f3ec", roughness: 0.78 });
  const buildingGeos: THREE.BufferGeometry[] = [];
  for (const building of model.buildings) {
    const shape = shapeFromRing(building.ring, building.holes);
    const base = model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0;
    if (!shape) continue;
    try {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: building.height,
        bevelEnabled: false,
      });
      layFlat(geometry, base);
      buildingGeos.push(geometry);
    } catch {
      try {
        const fallback = shapeFromRing(building.ring, []);
        if (!fallback) continue;
        const geometry = new THREE.ExtrudeGeometry(fallback, {
          depth: building.height,
          bevelEnabled: false,
        });
        layFlat(geometry, base);
        buildingGeos.push(geometry);
      } catch {
        /* Ignore footprints Three.js cannot extrude. */
      }
    }
  }
  const buildings = mergeMeshes(buildingGeos, buildingMat, "Buildings");
  if (buildings) group.add(buildings);

  const trees = buildTreeGroup(model.trees, sample ?? undefined);
  if (trees) group.add(trees);

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
