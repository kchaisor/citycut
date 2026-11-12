import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../../types";
import {
  cutIntersectsStoredLayerBbox,
  parseStoredSiteManifest,
  registryEntryForCut,
  STORED_SITE_LAYER_REGISTRY,
} from "./registry";
import { mgaLonLatRoundTripErrorM } from "./transform";
import { mgaCrs } from "../crsZone";
import {
  hideOvertureBuildingsOverlappingStoredMesh,
  overtureBuildingOverlapsStoredFootprint,
  slabAndStructureFootprintsNeverHide,
} from "./overlap";
import type { StoredSiteFootprint } from "./types";

const manifestPath = path.join(
  process.cwd(),
  "public/site-layers/sydney-rozelle/manifest.json",
);
const manifest = parseStoredSiteManifest(JSON.parse(readFileSync(manifestPath, "utf8")));

describe("stored site layer registry", () => {
  it("parses the Sydney Rozelle manifest", () => {
    expect(manifest?.id).toBe("sydney-rozelle");
    expect(manifest?.files.some((file) => file.path === "buildings.glb")).toBe(true);
  });

  it("intersects Rozelle bbox for a 1 km cut at the manifest centre", () => {
    expect(manifest).not.toBeNull();
    const center = { lon: 151.1831833, lat: -33.86769802 };
    expect(cutIntersectsStoredLayerBbox(center, 1000, manifest!)).toBe(true);
    expect(registryEntryForCut(center, 1000)?.id).toBe("sydney-rozelle");
  });

  it("does not match a Melbourne cut", () => {
    expect(registryEntryForCut({ lon: 144.97, lat: -37.81 }, 1000)).toBeNull();
  });

  it("registry lists at least one pack", () => {
    expect(STORED_SITE_LAYER_REGISTRY.length).toBeGreaterThan(0);
  });
});

describe("stored site overlap hiding", () => {
  const meshFootprint: StoredSiteFootprint = {
    id: "mesh-a",
    ring: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
    holes: [],
    props: { id: "mesh-a", layer: "Test", baseZ: 0, topZ: 12, role: "building" },
  };
  const slabFootprint: StoredSiteFootprint = {
    ...meshFootprint,
    id: "slab-a",
    props: { ...meshFootprint.props, id: "slab-a", role: "slab" },
  };

  const overlapping: BuildingFeat = {
    id: 1,
    ring: [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
      [5, 5],
    ],
    holes: [],
    height: 10,
    use: "residential",
    source: "osm_tag",
  };
  const separate: BuildingFeat = {
    id: 2,
    ring: [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
      [40, 40],
    ],
    holes: [],
    height: 8,
    use: "commercial",
    source: "osm_tag",
  };

  it("removes an overlapping Overture footprint and keeps a separate one", () => {
    const { buildings, hiddenCount } = hideOvertureBuildingsOverlappingStoredMesh(
      [overlapping, separate],
      [meshFootprint],
    );
    expect(hiddenCount).toBe(1);
    expect(buildings.map((b) => b.id)).toEqual([2]);
  });

  it("slab and structure footprints never hide Overture buildings", () => {
    expect(slabAndStructureFootprintsNeverHide([slabFootprint], overlapping)).toBe(false);
    expect(overtureBuildingOverlapsStoredFootprint(overlapping, slabFootprint).overlaps).toBe(true);
    const { hiddenCount } = hideOvertureBuildingsOverlappingStoredMesh([overlapping], [slabFootprint]);
    expect(hiddenCount).toBe(0);
  });
});

describe("stored site MGA transform", () => {
  it("round-trips a manifest centre vertex within 0.05 m", () => {
    expect(manifest).not.toBeNull();
    const origin = { lon: 151.1832, lat: -33.8677 };
    const zone = mgaCrs(origin.lon).zone;
    const [lon, lat] = manifest!.origin.lonLat;
    const err = mgaLonLatRoundTripErrorM(lon, lat, origin, zone);
    expect(err).toBeLessThan(0.05);
  });
});
