import { describe, expect, it } from "vitest";
import { sitePlanAi8 } from "./aiPlan";
import { model } from "./aiExport.test";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import type { CityModel } from "../types";

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor((i + 1) * 0.37) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function normalizeAiBytes(bytes: Uint8Array): string {
  return new TextDecoder("latin1")
    .decode(bytes)
    .replace(/%%CreationDate:.*\n/g, "")
    .replace(/%%Creator:.*\n/g, "");
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
    parts.sort();
    return parts.join("\n");
  } finally {
    doc.destroy();
  }
}

describe("deterministic exports", () => {
  it("writes identical site .ai bytes when feature order differs", async () => {
    const base = model();
    const shuffled: CityModel = {
      ...base,
      trees: shuffle(base.trees),
      buildings: shuffle(base.buildings),
      roads: shuffle(base.roads),
    };
    const a = await sitePlanAi8(shuffled, 1000, DEFAULT_LINE_STYLES);
    const b = await sitePlanAi8({ ...shuffled, trees: shuffle(shuffled.trees) }, 1000, DEFAULT_LINE_STYLES);
    expect(normalizeAiBytes(a)).toBe(normalizeAiBytes(b));
  });

  it("writes the same .3dm mesh layout across two runs (Rhino object ids vary)", async () => {
    const shuffled: CityModel = {
      ...model(),
      trees: shuffle(model().trees),
      areas: shuffle(model().areas),
    };
    const a = await cityModelTo3dm(shuffled);
    const b = await cityModelTo3dm({ ...shuffled, trees: shuffle(shuffled.trees) });
    expect(await rhinoMeshDigest(a)).toBe(await rhinoMeshDigest(b));
  });
});
