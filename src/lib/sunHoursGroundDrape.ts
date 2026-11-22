import * as THREE from "three";
import { terrainMeshHeight } from "./terrainDrape";
import { siteFrameFromModel } from "./modelFrame";
import { containsPoint } from "./siteFrame";
import type { SunHoursGroundGrid } from "./sunHoursGroundPlan";
import type { CityModel } from "../types";

const GROUND_LIFT_M = 0.1;

export const SUN_HOURS_GROUND_TEXTURE_FLIP_Y = true;

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
  const terrain = model.terrain;
  const vertCols = cols + 1;
  const vertRows = rows + 1;
  const positions = new Float32Array(vertCols * vertRows * 3);
  const uvs = new Float32Array(vertCols * vertRows * 2);
  const up = new THREE.Vector3(0, 1, 0);
  for (let row = 0; row < vertRows; row++) {
    for (let col = 0; col < vertCols; col++) {
      const east = originEast + col * cellM;
      const north = originNorth + row * cellM;
      const normal = terrain
        ? vertexNormal(east, north, model.sideM, terrain, Math.min(cellM * 0.48, 1.2))
        : up;
      const y = terrain ? terrainMeshHeight(terrain, model.sideM, east, north) : 0;
      const lifted = new THREE.Vector3(east, y, -north).addScaledVector(normal, liftM);
      const index = row * vertCols + col;
      positions[index * 3] = lifted.x;
      positions[index * 3 + 1] = lifted.y;
      positions[index * 3 + 2] = lifted.z;
      uvs[index * 2] = col / cols;
      uvs[index * 2 + 1] = SUN_HOURS_GROUND_TEXTURE_FLIP_Y ? row / rows : 1 - row / rows;
    }
  }
  const frame = siteFrameFromModel(model);
  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!containsPoint(frame, [originEast + (col + 0.5) * cellM, originNorth + (row + 0.5) * cellM])) continue;
      const sw = row * vertCols + col;
      const se = sw + 1;
      const nw = sw + vertCols;
      const ne = nw + 1;
      indices.push(sw, se, ne, sw, ne, nw);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
  geometry.computeVertexNormals();
  return geometry;
}
