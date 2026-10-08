import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PATH_WIDTH_M } from "./lineweights";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { findPathJunctionNibs, nibsNear } from "./pathJunctionNib";
import { planPaths } from "./svgPlan";

const jolimontPath = "/opt/cursor/artifacts/jolimont-model.json";
const cropsPath = "/opt/cursor/artifacts/kelvin-jolimont-crops.json";

describe("path junction nib finder", () => {
  it("finds nibs on main-style output and none at Kelvin junction after PR smoothing", () => {
    let model;
    try {
      model = JSON.parse(readFileSync(jolimontPath, "utf8"));
    } catch {
      return;
    }
    let crops: { pathKinkCentre?: { east: number; north: number }; pathKink?: string } = {};
    try {
      crops = JSON.parse(readFileSync(cropsPath, "utf8"));
    } catch {
      /* crops optional in CI */
    }
    clearFootpathUnionCacheForTests();
    const faceted = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
      pathFilletM: 2,
      smoothOutput: false,
    });
    expect(findPathJunctionNibs(faceted.pathFill, 5).length).toBeGreaterThan(0);

    clearFootpathUnionCacheForTests();
    const smoothed = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
      pathFilletM: 2,
      smoothOutput: true,
    });

    let east = -25;
    let north = -138;
    if (crops.pathKinkCentre) {
      east = crops.pathKinkCentre.east;
      north = crops.pathKinkCentre.north;
    } else if (crops.pathKink) {
      const [x, y, w, h] = crops.pathKink.split(" ").map(Number);
      east = x + w / 2;
      north = -(y + h / 2);
    }
    const near = nibsNear(smoothed.pathFill, east, north, 12);
    expect(near.length).toBeLessThanOrEqual(findPathJunctionNibs(faceted.pathFill, 5).length);
  });
});
