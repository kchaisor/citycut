import { describe, expect, it } from "vitest";
import { buildCityGroup, disposeObject } from "./buildCity";
import { model } from "./aiExport.test";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";

const fixture = model();
const baseline3dChildren = (() => {
  const group = buildCityGroup(fixture);
  const count = group.children.length;
  disposeObject(group);
  return count;
})();

describe("eleven-item blast radius", () => {
  it("does not change the default fixture Rhino object count", async () => {
    const fixture = model();
    const bytes = await cityModelTo3dm(fixture);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      expect(doc.objects().count).toBeGreaterThan(3);
      const names = new Set<string>();
      for (let i = 0; i < doc.objects().count; i++) {
        names.add(doc.objects().get(i).attributes().name);
      }
      expect(names.has("Trees")).toBe(true);
      expect([...names].some((name) => name.startsWith("Buildings::"))).toBe(true);
      expect([...names].some((name) => name.startsWith("ExplodedAxo"))).toBe(false);
    } finally {
      doc.destroy();
    }
  });

  it("keeps the default 3D city group child count on the export fixture", () => {
    const group = buildCityGroup(fixture);
    try {
      expect(group.children.length).toBe(baseline3dChildren);
    } finally {
      disposeObject(group);
    }
  });
});
