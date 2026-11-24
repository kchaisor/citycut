import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scene = readFileSync("src/components/Scene3D.tsx", "utf8");

describe("Plan Wind map and Flow switch", () => {
  it("only gates wind layers in the scene, never the camera or its fit", () => {
    const uses = scene.split("\n").filter((line) => line.includes("windPlanOn"));
    expect(uses).toHaveLength(2);
    expect(uses.some((line) => line.includes("const windPlanOn"))).toBe(true);
    expect(uses.some((line) => line.includes("windSceneLayers("))).toBe(true);
    expect(scene.split("\n").filter((line) => /windPlan\??\.(active|view)/.test(line))).toEqual([
      "  const windPlanOn = windPlan?.active === true;",
    ]);
  });
});
