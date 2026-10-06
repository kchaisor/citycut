import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { shotFromCamera } from "./cameraShot";
import { viewAi } from "./aiView";
import {
  applyHeightOverrides,
  applyOverrideToBuilding,
  buildingHeightsFingerprint,
  clearAllHeightOverrides,
  exportHeightOverridesJson,
  importHeightOverridesJson,
  footprintCentroidLonLat,
  matchOverridesToBuildings,
  mergeHeightOverrideStores,
  parseStoredHeightOverrides,
  readStoredHeightOverrides,
  upsertOverrideForBuilding,
  type HeightOverride,
  type HeightOverrideStore,
} from "./heightOverrides";
import { buildCityGroup, disposeObject } from "./buildCity";
import { sitePlanPdf } from "./aiPlan";
import type { BuildingFeat, CityModel, Pt } from "../types";

const origin = { lon: 144.9631, lat: -37.8136 };

function building(partial: Partial<BuildingFeat> & Pick<BuildingFeat, "id" | "ring">): BuildingFeat {
  return {
    holes: [],
    height: 12,
    use: "unclassified",
    source: "none",
    ...partial,
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

describe("heightOverrides storage", () => {
  it("falls back to empty on corrupted storage", () => {
    expect(parseStoredHeightOverrides("{not json")).toEqual({ v: 1, overrides: [] });
    expect(parseStoredHeightOverrides(JSON.stringify({ v: 2, overrides: [] }))).toEqual({ v: 1, overrides: [] });
  });

  it("round-trips export and import", () => {
    const store: HeightOverrideStore = {
      v: 1,
      overrides: [
        {
          overtureId: "gers:abc",
          centroid: [144.96, -37.81],
          areaM2: 400,
          heightM: 80,
          setAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const parsed = importHeightOverridesJson(exportHeightOverridesJson(store));
    expect(parsed).toEqual(store);
  });

  it("merges imported overrides, replacing duplicates", () => {
    const base: HeightOverrideStore = {
      v: 1,
      overrides: [{ overtureId: "gers:a", centroid: [1, 2], areaM2: 100, heightM: 10, setAt: "t0" }],
    };
    const incoming: HeightOverrideStore = {
      v: 1,
      overrides: [
        { overtureId: "gers:a", centroid: [1, 2], areaM2: 100, heightM: 99, setAt: "t1" },
        { overtureId: "gers:b", centroid: [3, 4], areaM2: 50, heightM: 20, setAt: "t2" },
      ],
    };
    const merged = mergeHeightOverrideStores(base, incoming);
    expect(merged.overrides).toHaveLength(2);
    expect(merged.overrides.find((item) => item.overtureId === "gers:a")?.heightM).toBe(99);
  });

  it("reads from a key-value store", () => {
    const storage = new Map<string, string>();
    storage.set("citycut.heightOverrides", exportHeightOverridesJson(clearAllHeightOverrides()));
    expect(readStoredHeightOverrides({ getItem: (k) => storage.get(k) ?? null, setItem: () => {} }).overrides).toEqual(
      [],
    );
  });
});

describe("heightOverrides matching", () => {
  const buildings: BuildingFeat[] = [
    building({ id: 1, overtureId: "gers:one", ring: square([0, 0], 20), height: 9 }),
    building({ id: 2, osmWayIds: [13307317], ring: square([40, 0], 20), height: 15 }),
    building({ id: 3, ring: square([80, 0], 20), height: 18 }),
  ];

  it("matches by Overture id first", () => {
    const overrides: HeightOverride[] = [
      { overtureId: "gers:one", centroid: [0, 0], areaM2: 999, heightM: 40, setAt: "t" },
    ];
    const { matched, unmatchedCount } = matchOverridesToBuildings(buildings, overrides, origin);
    expect(unmatchedCount).toBe(0);
    expect(matched.get(1)?.heightM).toBe(40);
  });

  it("falls back to shared OSM way id", () => {
    const overrides: HeightOverride[] = [
      { osmWayIds: [13307317], centroid: [0, 0], areaM2: 999, heightM: 55, setAt: "t" },
    ];
    const { matched } = matchOverridesToBuildings(buildings, overrides, origin);
    expect(matched.get(2)?.heightM).toBe(55);
  });

  it("matches centroid and area within tolerance", () => {
    const target = buildings[2]!;
    const overrides: HeightOverride[] = [
      {
        centroid: footprintCentroidLonLat(target, origin),
        areaM2: 400,
        heightM: 70,
        setAt: "t",
      },
    ];
    const { matched } = matchOverridesToBuildings(buildings, overrides, origin);
    expect(matched.get(3)?.heightM).toBe(70);
  });

  it("does not centroid-match outside tolerance", () => {
    const overrides: HeightOverride[] = [
      {
        centroid: [origin.lon + 0.05, origin.lat],
        areaM2: 400,
        heightM: 70,
        setAt: "t",
      },
    ];
    const { matched, unmatchedCount } = matchOverridesToBuildings(buildings, overrides, origin);
    expect(matched.size).toBe(0);
    expect(unmatchedCount).toBe(1);
  });

  it("assigns at most one override per building", () => {
    const overrides: HeightOverride[] = [
      { overtureId: "gers:one", centroid: [0, 0], areaM2: 400, heightM: 40, setAt: "t" },
      { overtureId: "gers:one", centroid: [0, 0], areaM2: 400, heightM: 50, setAt: "t2" },
    ];
    const { matched, unmatchedCount } = matchOverridesToBuildings(buildings, overrides, origin);
    expect(matched.size).toBe(1);
    expect(unmatchedCount).toBe(1);
  });

  it("counts unmatched overrides kept in storage", () => {
    const store: HeightOverrideStore = {
      v: 1,
      overrides: [{ overtureId: "gers:missing", centroid: [0, 0], areaM2: 10, heightM: 5, setAt: "t" }],
    };
    const result = applyHeightOverrides(buildings, store, origin);
    expect(result.unmatchedCount).toBe(1);
    expect(result.manualCount).toBe(0);
    expect(result.buildings).toEqual(buildings);
  });

  it("replaces extrusionParts with a single height", () => {
    const split = building({
      id: 4,
      ring: square([0, 40], 20),
      height: 9,
      extrusionParts: [
        { ring: square([0, 40], 10), holes: [], height: 30 },
        { ring: square([0, 40], 10), holes: [], height: 48 },
      ],
    });
    const next = applyOverrideToBuilding(split, 120);
    expect(next.height).toBe(120);
    expect(next.heightManual).toBe(true);
    expect(next.extrusionParts).toBeUndefined();
    expect(next.heightFromFallback).toBeUndefined();
  });
});

describe("heightOverrides exports", () => {
  const model: CityModel = {
    placeLabel: "Test",
    center: origin,
    sideM: 200,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings: [building({ id: 1, ring: square([0, 0], 40), height: 12 })],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };

  it("feeds overridden height to the same mesh path Rhino export uses", () => {
    const overridden = applyHeightOverrides(
      model.buildings,
      upsertOverrideForBuilding(clearAllHeightOverrides(), model.buildings[0]!, origin, 120),
      origin,
    ).buildings;
    const group = buildCityGroup({ ...model, buildings: overridden }, { splitBuildings: true });
    const box = new THREE.Box3().setFromObject(group);
    disposeObject(group);
    expect(box.max.y).toBeGreaterThan(119);
    expect(box.max.y).toBeLessThan(121);
  });

  it("feeds overridden height to site plan PDF export", async () => {
    const overridden = applyHeightOverrides(
      model.buildings,
      upsertOverrideForBuilding(clearAllHeightOverrides(), model.buildings[0]!, origin, 120),
      origin,
    ).buildings;
    const bytes = await sitePlanPdf({ ...model, buildings: overridden, manualHeightEditCount: 1 }, 500);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("feeds overridden height to the 3D view PDF export", async () => {
    const overridden = applyHeightOverrides(
      model.buildings,
      upsertOverrideForBuilding(clearAllHeightOverrides(), model.buildings[0]!, origin, 120),
      origin,
    ).buildings;
    const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.5, 4000);
    camera.position.set(-90, 80, 110);
    camera.lookAt(0, 6, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const shot = shotFromCamera(camera, 640, 400);
    const bytes = await viewAi({ ...model, buildings: overridden, manualHeightEditCount: 1 }, shot, {
      uniformBuildings: false,
      colourBySource: false,
    });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("heightOverrides blast radius (zero overrides)", () => {
  it("leaves building fingerprints and Rhino export unchanged", async () => {
    const buildings: BuildingFeat[] = [
      building({ id: 1, ring: square([0, 0], 40), height: 12, overtureId: "gers:x" }),
      building({
        id: 2,
        ring: square([60, 0], 30),
        height: 9,
        extrusionParts: [{ ring: square([60, 0], 20), holes: [], height: 22 }],
      }),
    ];
    const empty = clearAllHeightOverrides();
    const applied = applyHeightOverrides(buildings, empty, origin);
    expect(buildingHeightsFingerprint(applied.buildings)).toBe(buildingHeightsFingerprint(buildings));

    const model: CityModel = {
      placeLabel: "Bench",
      center: origin,
      sideM: 600,
      layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      buildings,
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "test",
      comBuildingHeights: true,
    };
    expect(applied.buildings).toEqual(buildings);
    const baselineHeights = JSON.stringify(
      buildings.map((b) => ({ id: b.id, height: b.height, parts: b.extrusionParts?.map((p) => p.height) })),
    );
    const pipelineHeights = JSON.stringify(
      applied.buildings.map((b) => ({ id: b.id, height: b.height, parts: b.extrusionParts?.map((p) => p.height) })),
    );
    expect(pipelineHeights).toBe(baselineHeights);

    const baselineGroup = buildCityGroup(model, { splitBuildings: true });
    const pipelineGroup = buildCityGroup({ ...model, buildings: applied.buildings }, { splitBuildings: true });
    const baselineBox = new THREE.Box3().setFromObject(baselineGroup);
    const pipelineBox = new THREE.Box3().setFromObject(pipelineGroup);
    disposeObject(baselineGroup);
    disposeObject(pipelineGroup);
    expect(pipelineBox.max.y).toBeCloseTo(baselineBox.max.y, 5);
    expect(pipelineBox.min.y).toBeCloseTo(baselineBox.min.y, 5);
  });
});
