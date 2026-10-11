import { describe, expect, it } from "vitest";
import { defaultExplodedAxoSettings } from "./explodedAxo";
import { explodedAxoAi, sitePlanAi8 } from "./aiPlan";
import { model } from "./aiExport.test";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import type { CityModel, TreeFeat } from "../types";

function normalizeAiBytes(bytes: Uint8Array): string {
  return new TextDecoder("latin1")
    .decode(bytes)
    .replace(/%%CreationDate:.*\n/g, "")
    .replace(/%%Creator:.*\n/g, "")
    .replace(/\(D:\d{14}[^)]*\)/g, "(D:X)")
    .replace(/\/CreationDate\s*\(D:[^)]*\)/g, "/CreationDate (D:X)")
    .replace(/\/ModDate\s*\(D:[^)]*\)/g, "/ModDate (D:X)")
    .replace(/\(\d+\)\s*$/gm, "");
}

/** Two API loads: same trees, response row order and ids differ. */
function treeLoads(base: CityModel): [CityModel, CityModel] {
  const firstLoad: TreeFeat[] = [
    {
      id: 0,
      at: [10.123, 20.456],
      height_m: 12,
      crown_diameter_m: 8,
      trunk_diameter_m: 0.4,
      sizeSource: "vicmap",
      species: "Eucalyptus",
    },
    {
      id: 1,
      at: [-5.2, 3.05],
      height_m: 9,
      crown_diameter_m: 6,
      trunk_diameter_m: 0.35,
      sizeSource: "com",
      genus: "Quercus",
    },
  ];
  const secondLoad: TreeFeat[] = [
    { ...firstLoad[1]!, id: 0 },
    { ...firstLoad[0]!, id: 1 },
  ];
  return [
    { ...base, trees: firstLoad },
    { ...base, trees: secondLoad },
  ];
}

async function rhinoMeshDigest(bytes: Uint8Array): Promise<string> {
  const rhino = await loadRhino();
  const doc = rhino.File3dm.fromByteArray(bytes);
  try {
    const parts: string[] = [];
    for (let i = 0; i < doc.objects().count; i++) {
      const obj = doc.objects().get(i);
      const name = obj.attributes().name;
      const geo = obj.geometry() as unknown as {
        objectType: number;
        vertices: () => { count: number };
        faces: () => { count: number };
      };
      if (geo.objectType !== rhino.ObjectType.Mesh) continue;
      parts.push(`${name}:${geo.vertices().count}:${geo.faces().count}`);
    }
    return parts.join("\n");
  } finally {
    doc.destroy();
  }
}

describe("deterministic exports", () => {
  it("writes identical site .ai bytes when tree API row order and ids differ", async () => {
    const [loadA, loadB] = treeLoads(model());
    const a = await sitePlanAi8(loadA, 1000, DEFAULT_LINE_STYLES);
    const b = await sitePlanAi8(loadB, 1000, DEFAULT_LINE_STYLES);
    expect(normalizeAiBytes(a)).toBe(normalizeAiBytes(b));
  });

  it("writes identical exploded axo .ai bytes when tree API row order and ids differ", async () => {
    const [loadA, loadB] = treeLoads(model());
    const settings = defaultExplodedAxoSettings(loadA.sideM);
    const a = await explodedAxoAi(loadA, 1000, settings);
    const b = await explodedAxoAi(loadB, 1000, settings);
    expect(normalizeAiBytes(a)).toBe(normalizeAiBytes(b));
  });

  it("writes the same .3dm mesh layout when tree API row order and ids differ", async () => {
    const [loadA, loadB] = treeLoads(model());
    const a = await cityModelTo3dm(loadA);
    const b = await cityModelTo3dm(loadB);
    expect(await rhinoMeshDigest(a)).toBe(await rhinoMeshDigest(b));
  });
});
