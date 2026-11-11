import { projectLocal } from "./crs";
import { cutCentrePlacement } from "./massingImport";
import type { ImportedMassing } from "./massingImport";
import type { LonLat } from "../types";

function meshBox(
  positions: number[],
  indices: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  vertexBase: number,
): number {
  const verts = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  for (const [x, y, z] of verts) positions.push(x, y, z);
  const quads = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  for (const [a, b, c, d] of quads) {
    const va = vertexBase + a!;
    const vb = vertexBase + b!;
    const vc = vertexBase + c!;
    const vd = vertexBase + d!;
    indices.push(va, vb, vc, va, vc, vd);
  }
  return vertexBase + 8;
}

export function qaPodiumTowerMassing(center: LonLat, zone: number, base: number): ImportedMassing {
  const placement = cutCentrePlacement({ center }, zone, base);
  const [anchorE, anchorN] = projectLocal([0, 0], center, zone);
  const positions: number[] = [];
  const indices: number[] = [];
  let vtx = 0;
  vtx = meshBox(positions, indices, -15, -10, 15, 10, 0, 12, vtx);
  vtx = meshBox(positions, indices, -8, 2, -2, 8, 12, 38, vtx);
  vtx = meshBox(positions, indices, 4, -6, 10, 0, 12, 28, vtx);
  return {
    id: "qa-podium-towers",
    name: "qa-podium-towers.3dm",
    fileBytes: 1,
    mode: "click",
    visible: true,
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    triangles: indices.length / 3,
    anchor: { e: anchorE, n: anchorN, z: base },
    halfExtent: { x: 15, y: 10 },
    sourceUnits: "Meters",
    unitScale: 1,
    fileZone: zone,
    rejectedSurfaces: 0,
    notes: [],
    placement,
  };
}
