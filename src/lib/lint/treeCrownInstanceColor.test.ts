import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readText, relFromRoot, walkFiles } from "./repoScan";

const srcRoot = join(import.meta.dirname, "../..");
const TREE_SOURCES = ["lib/treeMassing.ts", "lib/buildCity.ts", "lib/trees.ts"];

const FIXTURE_BAD = `
const mesh = new THREE.InstancedMesh(geo, mat, n);
mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
mesh.setColorAt(0, new THREE.Color("#000000"));
`;

export function scanTreeCrownInstanceColor(source: string): string[] {
  const hits: string[] = [];
  if (/instanceColor/.test(source)) hits.push("instanceColor");
  if (/setColorAt\s*\(/.test(source)) hits.push("setColorAt");
  return hits;
}

describe("lint: tree crown vertex colours", () => {
  it("flags instanceColor and setColorAt on crown meshes", () => {
    expect(scanTreeCrownInstanceColor(FIXTURE_BAD)).toEqual(["instanceColor", "setColorAt"]);
  });

  it("passes current tree massing sources", () => {
    const offenders: string[] = [];
    for (const rel of TREE_SOURCES) {
      const text = readText(join(srcRoot, rel));
      const hits = scanTreeCrownInstanceColor(text);
      if (hits.length > 0) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    for (const file of walkFiles(
      srcRoot,
      (path) => /tree/i.test(path) && /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path),
    )) {
      const rel = relFromRoot(srcRoot, file);
      if (TREE_SOURCES.includes(rel)) continue;
      const text = readText(file);
      if (!/TreeCrowns|crownMaterial|mergedCrowns/.test(text)) continue;
      const hits = scanTreeCrownInstanceColor(text);
      if (hits.length > 0) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
