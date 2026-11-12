import * as THREE from "three";
import { terrainMeshHeight } from "./terrainDrape";
import type { SunHoursGroundGrid } from "./sunHoursGroundPlan";
import type { CityModel } from "../types";

const GROUND_LIFT_M = 0.1;

function vertexNormal(
  east: number,
  north: number,
  sideM: number,
  field: NonNullable<CityModel["terrain"]>,
  delta = 0.45,
): THREE.Vector3 {
  const yC = terrainMeshHeight(field, sideM, east, north);
  const yE = terrainMeshHeight(field, sideM, east + delta, north);
  const yN = terrainMeshHeight(field, sideM, east, north + delta);
  const tE = new THREE.Vector3(delta, yE - yC, 0);
  const tN = new THREE.Vector3(0, yN - yC, -delta);
  return new THREE.Vector3().crossVectors(tE, tN).normalize();
}

export function buildSunHoursGroundDrapeGeometry(
  grid: SunHoursGroundGrid,
  model: CityModel,
  liftM = GROUND_LIFT_M,
): THREE.BufferGeometry {
  const { cols, rows, cellM, originEast, originNorth } = grid;
  if (!model.terrain) {
    const geom = new THREE.PlaneGeometry(model.sideM, model.sideM, cols, rows);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, liftM, 0);
    return geom;
  }
  const vertCols = cols + 1;
  const vertRows = rows + 1;
  const positions = new Float32Array(vertCols * vertRows * 3);
  const uvs = new Float32Array(vertCols * vertRows * 2);
  for (let row = 0; row < vertRows; row++) {
    for (let col = 0; col < vertCols; col++) {
      const east = originEast + col * cellM;
      const north = originNorth + row * cellM;
      const normal = vertexNormal(east, north, model.sideM, model.terrain, Math.min(cellM * 0.48, 1.2));
      const y = terrainMeshHeight(model.terrain, model.sideM, east, north);
      const lifted = new THREE.Vector3(east, y, -north).addScaledVector(normal, liftM);
      const index = row * vertCols + col;
      positions[index * 3] = lifted.x;
      positions[index * 3 + 1] = lifted.y;
      positions[index * 3 + 2] = lifted.z;
      uvs[index * 2] = col / cols;
      uvs[index * 2 + 1] = 1 - row / rows;
    }
  }
  const indices = new Uint32Array(cols * rows * 6);
  let write = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sw = row * vertCols + col;
      const se = sw + 1;
      const nw = sw + vertCols;
      const ne = nw + 1;
      indices[write++] = sw;
      indices[write++] = se;
      indices[write++] = ne;
      indices[write++] = sw;
      indices[write++] = ne;
      indices[write++] = nw;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
