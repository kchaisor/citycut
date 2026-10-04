import { describe, expect, it, vi } from "vitest";
import { buildCityGroup, disposeObject } from "./buildCity";
import { cityModelTo3dm } from "./rhinoExport";
import {
  INFILL_CLEARANCE_M,
  INFILL_SPACING_M,
  MAX_TREE_INSTANCES,
  ROAD_MASK_BUFFER_M,
  TREE_DEDUPE_M,
  assembleTreeTiers,
  capTreeInstances,
  fillCanopy,
  omitWithin,
  type CanopyPatch,
} from "./treeTiers";
import type { CityModel, Pt, TreeFeat } from "../types";

function tree(at: Pt, tier: TreeFeat["tier"], id = 1): TreeFeat {
  return {
    id,
    at,
    height_m: 10,
    crown_diameter_m: 6,
    trunk_diameter_m: 0.35,
    sizeSource: tier === "vicmap" ? "vicmap" : tier === "com" ? "com" : "default",
    tier,
  };
}

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("tree tier dedupe", () => {
  it("drops a lower tier inside 3 m and keeps one just outside", () => {
    const com = [tree([0, 0], "com", 1)];
    const osm = omitWithin(
      com.map((item) => item.at),
      [tree([2.9, 0], "osm", 2), tree([TREE_DEDUPE_M + 0.05, 0], "osm", 3)],
      TREE_DEDUPE_M,
    );
    expect(osm.map((item) => item.id)).toEqual([3]);

    const assembled = assembleTreeTiers({
      com,
      osm: [tree([1, 1], "osm", 2), tree([20, 0], "osm", 3)],
      vicmap: [tree([20 + 2, 0], "vicmap", 4), tree([40, 0], "vicmap", 5), tree([40.5, 0], "vicmap", 6)],
      canopy: [],
      buildings: [],
      water: [],
      roads: [],
    });
    const ids = assembled.trees.map((item) => item.id);
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).toContain(3);
    expect(ids).not.toContain(4);
    expect(ids).toContain(5);
    expect(ids).toContain(6);
    expect(assembled.capHit).toBe(false);
  });
});

describe("tree instance cap", () => {
  it("trims canopy infill before Vicmap and leaves the higher tiers", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const osm = Array.from({ length: 5000 }, (_, index) => tree([index, 0], "osm", index));
    const vicmap = Array.from({ length: 4000 }, (_, index) => tree([index, 10], "vicmap", index));
    const canopy = Array.from({ length: 2000 }, (_, index) => tree([index, 20], "canopy", index));
    const capped = capTreeInstances({ com: [], osm, vicmap, canopy });
    expect(capped.capHit).toBe(true);
    expect(capped.trees).toHaveLength(MAX_TREE_INSTANCES);
    expect(capped.trimmed.canopy).toBe(2000);
    expect(capped.trimmed.vicmap).toBe(1000);
    expect(capped.trimmed.osm).toBe(0);
    expect(capped.trees.filter((item) => item.tier === "osm")).toHaveLength(5000);
    expect(capped.trees.filter((item) => item.tier === "vicmap")).toHaveLength(3000);
    expect(capped.trees.filter((item) => item.tier === "canopy")).toHaveLength(0);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("capped trees at 8000"));
    info.mockRestore();
  });
});

describe("canopy infill", () => {
  it("spaces samples, and keeps them out of buildings, roads, water, and existing trees", () => {
    const wood: CanopyPatch = { ring: square([0, 10], 70), holes: [], kind: "wood" };
    const filled = fillCanopy(
      [wood],
      {
        buildings: [{ ring: square([18, 22], 14), holes: [] }],
        water: [{ ring: square([-18, 22], 12), holes: [] }],
        roads: [{ line: [[-40, -10], [40, -10]], width: 6 }],
        trees: [[0, 28]],
      },
      mulberry32(7),
    );
    expect(filled.length).toBeGreaterThan(15);
    const reach = 6 / 2 + ROAD_MASK_BUFFER_M;
    for (const sample of filled) {
      const inBuilding = Math.abs(sample.at[0] - 18) <= 7 && Math.abs(sample.at[1] - 22) <= 7;
      const inWater = Math.abs(sample.at[0] + 18) <= 6 && Math.abs(sample.at[1] - 22) <= 6;
      expect(inBuilding).toBe(false);
      expect(inWater).toBe(false);
      expect(Math.abs(sample.at[1] + 10)).toBeGreaterThanOrEqual(reach - 0.05);
      expect(Math.hypot(sample.at[0], sample.at[1] - 28)).toBeGreaterThanOrEqual(INFILL_CLEARANCE_M - 0.05);
      expect(sample.tier).toBe("canopy");
    }
    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const distance = Math.hypot(filled[i].at[0] - filled[j].at[0], filled[i].at[1] - filled[j].at[1]);
        expect(distance).toBeGreaterThanOrEqual(INFILL_SPACING_M - 0.05);
      }
    }
  });

  it("uses smaller scrub massing for scrub canopy", () => {
    const filled = fillCanopy(
      [{ ring: square([0, 0], 36), holes: [], kind: "scrub" }],
      { buildings: [], water: [], roads: [], trees: [] },
      mulberry32(3),
    );
    expect(filled.length).toBeGreaterThan(4);
    expect(filled.every((sample) => sample.height_m < 4 && sample.crown_diameter_m <= 3)).toBe(true);
  });
});

describe("tier exports", () => {
  const origin = { lon: 144.9631, lat: -37.8136 };
  const trees: TreeFeat[] = [
    tree([0, 0], "com", 1),
    { ...tree([12, 0], "osm", 2), height_m: 18, crown_diameter_m: 8, sizeSource: "osm" },
    { ...tree([24, 0], "vicmap", 3), sizeSource: "vicmap" },
    { ...tree([36, 0], "canopy", 4), height_m: 2.5, crown_diameter_m: 2 },
  ];
  const model: CityModel = {
    placeLabel: "Test",
    center: origin,
    sideM: 200,
    layers: { buildings: false, roads: false, waterGreen: false, trees: true },
    buildings: [],
    roads: [],
    areas: [],
    trees,
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };

  it("instances every tier", () => {
    const group = buildCityGroup(model);
    try {
      expect(group.getObjectByName("Trees")?.children.length).toBe(2);
    } finally {
      disposeObject(group);
    }
  });

  it("writes every tier into the Rhino file", async () => {
    const bytes = await cityModelTo3dm(model);
    const { loadRhino } = await import("./rhinoExport");
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      let vertices = 0;
      let treeObjects = 0;
      for (let i = 0; i < doc.objects().count; i++) {
        const object = doc.objects().get(i);
        if (object.attributes().name !== "Trees") continue;
        treeObjects += 1;
        const geometry = object.geometry() as unknown as { vertices: () => { count: number } };
        vertices += geometry.vertices().count;
      }
      expect(treeObjects).toBe(2);
      const one = await cityModelTo3dm({ ...model, trees: [trees[0]] });
      const oneDoc = rhino.File3dm.fromByteArray(one);
      try {
        let oneVertices = 0;
        for (let i = 0; i < oneDoc.objects().count; i++) {
          const object = oneDoc.objects().get(i);
          if (object.attributes().name !== "Trees") continue;
          const geometry = object.geometry() as unknown as { vertices: () => { count: number } };
          oneVertices += geometry.vertices().count;
        }
        expect(vertices).toBeGreaterThan(oneVertices);
        expect(oneVertices).toBeGreaterThan(0);
      } finally {
        oneDoc.destroy();
      }
    } finally {
      doc.destroy();
    }
  });
});
