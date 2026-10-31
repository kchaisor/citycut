import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { COLOUR_FALLBACK } from "./colours";
import {
  HEIGHT_RELIABILITY_KEYS,
  HEIGHT_RELIABILITY_META,
  buildingHeightReliability,
  countHeightReliability,
  heightTierReliability,
  parseReliabilityBucket,
  reliabilityBucketName,
} from "./heightReliability";
import { buildingViewportFill, parseBuildingBucketName, reliabilityColourFade, stepColourFade } from "./buildingViewportColor";
import { buildCityGroup } from "./buildCity";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import type { BuildingFeat, BuildingHeightTier, CityModel, Pt } from "../types";

function square(x: number, size: number): Pt[] {
  const h = size / 2;
  return [
    [x - h, -h],
    [x + h, -h],
    [x + h, h],
    [x - h, h],
    [x - h, -h],
  ];
}

function bldg(id: number, patch: Partial<BuildingFeat>): BuildingFeat {
  return { id, ring: square(id * 30, 20), holes: [], height: 12, use: "unclassified", source: "none", ...patch };
}

const buildings: BuildingFeat[] = [
  bldg(1, { heightTier: "com" }),
  bldg(2, { heightTier: "lidar" }),
  bldg(3, { heightTier: "osm_levels" }),
  bldg(4, { heightTier: "development_floors" }),
  bldg(5, { heightTier: "zone_default", heightFromFallback: true }),
  bldg(6, { heightManual: true }),
];

const model: CityModel = {
  placeLabel: "Test",
  center: { lon: 144.9631, lat: -37.8136 },
  sideM: 400,
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
  buildings,
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "test",
};

describe("height reliability", () => {
  it("maps every real height tier to measured, recorded, estimated or manual", () => {
    const tiers: Record<BuildingHeightTier, string> = {
      manual: "manual",
      com: "measured",
      lidar: "measured",
      overture_height: "recorded",
      overture_floors: "recorded",
      development_floors: "recorded",
      osm_levels: "recorded",
      zone_default: "estimated",
      real_source_unmatched: "estimated",
    };
    for (const [tier, expected] of Object.entries(tiers)) {
      expect(heightTierReliability(tier as BuildingHeightTier)).toBe(expected);
    }
  });

  it("reads inferred tiers when heightTier is missing", () => {
    expect(buildingHeightReliability(bldg(1, { heightFromFallback: true }))).toBe("estimated");
    expect(buildingHeightReliability(bldg(1, { numFloors: 4 }))).toBe("recorded");
    expect(buildingHeightReliability(bldg(1, { heightManual: true, heightTier: "com" }))).toBe("manual");
  });

  it("counts buildings per tier and skips imported massing", () => {
    const counts = countHeightReliability([...buildings, bldg(9, { importedMassing: true } as Partial<BuildingFeat>)]);
    expect(counts).toEqual({ measured: 2, recorded: 2, estimated: 1, manual: 1 });
  });

  it("uses colour tokens and labels estimates", () => {
    for (const key of HEIGHT_RELIABILITY_KEYS) {
      expect(HEIGHT_RELIABILITY_META[key].color).toBe(COLOUR_FALLBACK[HEIGHT_RELIABILITY_META[key].key]);
    }
    expect(HEIGHT_RELIABILITY_META.estimated.estimate).toBe(true);
    expect(HEIGHT_RELIABILITY_META.measured.estimate).toBe(false);
  });

  it("round-trips bucket names and wins over source colouring", () => {
    for (const key of HEIGHT_RELIABILITY_KEYS) {
      expect(parseReliabilityBucket(reliabilityBucketName(key))).toBe(key);
      expect(parseBuildingBucketName(reliabilityBucketName(key)).reliability).toBe(key);
    }
    const fill = buildingViewportFill(
      { colourByUse: true, uniformBuildings: false, colourBySource: true, colourByReliability: true },
      "retail",
      "zone",
      "measured",
    );
    expect(fill).toBe(HEIGHT_RELIABILITY_META.measured.color);
  });

  it("eases colours from the previous fill to the reliability fill", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: HEIGHT_RELIABILITY_META.measured.color });
    material.userData.viewportFill = HEIGHT_RELIABILITY_META.measured.color;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = reliabilityBucketName("measured");
    root.add(mesh);
    const fade = reliabilityColourFade(root, "#000000");
    stepColourFade(fade, 0);
    expect(material.color.getHexString()).toBe("000000");
    stepColourFade(fade, 1);
    expect(`#${material.color.getHexString()}`.toUpperCase()).toBe(HEIGHT_RELIABILITY_META.measured.color.toUpperCase());
  });

  it("buckets merged 3D buildings by reliability", () => {
    const group = buildCityGroup(model, { colourByReliability: true });
    const names = new Set<string>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name.startsWith("reliability:")) names.add(object.name);
    });
    expect([...names].sort()).toEqual(HEIGHT_RELIABILITY_KEYS.map(reliabilityBucketName).sort());
  });

  it("writes reliability user strings and layers into the Rhino export", async () => {
    const bytes = await cityModelTo3dm(model, { colourByReliability: true });
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const layerNames = new Set<string>();
      for (let i = 0; i < doc.layers().count; i++) layerNames.add(doc.layers().get(i).fullPath);
      for (const key of HEIGHT_RELIABILITY_KEYS) expect(layerNames.has(HEIGHT_RELIABILITY_META[key].layer)).toBe(true);
      const tags: string[] = [];
      for (let i = 0; i < doc.objects().count; i++) {
        const value = doc.objects().get(i).attributes().getUserString("height_reliability");
        if (value) tags.push(value);
      }
      expect(tags.sort()).toEqual(["estimated", "manual", "measured", "measured", "recorded", "recorded"]);
    } finally {
      doc.destroy();
    }
  });
});
