import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const buildingEdgesPath = join(import.meta.dirname, "../buildingEdges.ts");

const FIXTURE_BAD = `
for (const mesh of meshes) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 25);
  const lines = new THREE.LineSegments(edges, material);
  batch.add(lines);
}
`;

export function scanPerBuildingEdgeSplit(source: string): boolean {
  const loop = /for\s*\(\s*const\s+\w+\s+of\s+\w+\s*\)\s*\{[\s\S]*?new\s+THREE\.EdgesGeometry/m;
  if (!loop.test(source)) return false;
  return !/mergeGeometries|mergeEdgeGeometries/.test(source);
}

describe("lint: merged building edges", () => {
  it("flags per-mesh EdgesGeometry loops without merge", () => {
    expect(scanPerBuildingEdgeSplit(FIXTURE_BAD)).toBe(true);
  });

  it("passes buildingEdges.ts implementation", () => {
    const source = readFileSync(buildingEdgesPath, "utf8");
    expect(scanPerBuildingEdgeSplit(source)).toBe(false);
    expect(source).toContain("mergeEdgeGeometries");
    expect(source).toContain('lines.name = "BuildingEdges"');
  });
});
