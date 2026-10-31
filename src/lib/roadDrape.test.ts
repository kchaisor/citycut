import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildCityGroup } from "./buildCity";
import { clipTrianglesToTerrainGrid, terrainMeshHeight } from "./terrainDrape";
import type { CityModel, TerrainField } from "../types";

function hills(sideM: number, spacingM: number): TerrainField {
  const cols = Math.round(sideM / spacingM) + 1;
  const heights = new Float32Array(cols * cols);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let r = 0; r < cols; r++)
    for (let c = 0; c < cols; c++) {
      const e = c * spacingM;
      const n = r * spacingM;
      heights[r * cols + c] =
        6 * Math.sin(e / 37) * Math.cos(n / 53) + 3 * Math.sin((e + n) / 19) + 0.3 * (rnd() - 0.5);
    }
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { cols, rows: cols, heights, min, max, spacingM, zoom: 17, metresPerPixel: spacingM, source: "test" };
}

describe("ground layers draped on terrain", () => {
  it("never puts a road point below the terrain mesh, and leaves no coarse triangles", () => {
    const model = JSON.parse(
      readFileSync(new URL("./fixtures/dandenong-cleeland-ground.json", import.meta.url), "utf8"),
    ) as CityModel;
    const terrain = hills(model.sideM, 2.4);
    model.terrain = terrain;
    const group = buildCityGroup(model);
    let roadTris = 0;
    let below = 0;
    let longest = 0;
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !["Roads", "Green", "Water", "Blocks"].includes(mesh.name)) return;
      const pos = mesh.geometry.getAttribute("position");
      const index = mesh.geometry.getIndex();
      const count = index ? index.count : pos.count;
      const vertex = (i: number) => {
        const j = index ? index.getX(i) : i;
        return [pos.getX(j), pos.getY(j), pos.getZ(j)];
      };
      for (let i = 0; i + 2 < count; i += 3) {
        const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
        if (mesh.name === "Roads") roadTris++;
        for (let k = 0; k < 3; k++) {
          const p = tri[k]!;
          const q = tri[(k + 1) % 3]!;
          longest = Math.max(longest, Math.hypot(p[0] - q[0], p[2] - q[2]));
        }
        const weights = [
          [1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5],
        ];
        for (const w of weights) {
          const at = (axis: number) => w[0]! * tri[0]![axis]! + w[1]! * tri[1]![axis]! + w[2]! * tri[2]![axis]!;
          if (at(1) < terrainMeshHeight(terrain, model.sideM, at(0), -at(2)) - 1e-3) below++;
        }
      }
    });
    expect(roadTris).toBeGreaterThan(1000);
    expect(below).toBe(0);
    expect(longest).toBeLessThanOrEqual(terrain.spacingM * Math.SQRT2 + 1e-3);
  });

  it("matches the terrain mesh at grid nodes and stays planar inside a cell triangle", () => {
    const field = hills(24, 2.4);
    const half = 12;
    expect(terrainMeshHeight(field, 24, -half + 2.4 * 3, -half + 2.4 * 4)).toBeCloseTo(field.heights[4 * field.cols + 3]!, 5);
    const pieces = clipTrianglesToTerrainGrid([[[-11, -11], [11, -10], [0, 11]]], field, 24);
    const area = (t: number[][]) => Math.abs((t[1]![0]! - t[0]![0]!) * (t[2]![1]! - t[0]![1]!) - (t[2]![0]! - t[0]![0]!) * (t[1]![1]! - t[0]![1]!)) / 2;
    const total = pieces.reduce((sum, t) => sum + area(t), 0);
    expect(total).toBeCloseTo(area([[-11, -11], [11, -10], [0, 11]]), 4);
  });
});
