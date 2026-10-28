import { describe, expect, it } from "vitest";
import { BUILDING_USE_META, SOURCE_META } from "./buildingUse";
import { COLOUR_FALLBACK } from "./colours";
import * as THREE from "three";
import { applyBuildingSolarNeutral, buildingViewportFill, parseBuildingBucketName, snapshotBuildingViewportColors } from "./buildingViewportColor";
import { applySunStudySurfaceTint, refreshSceneSurfaceColors, snapshotSunStudySurfaceColors } from "./sunStudySurfaceViewport";
import { applyWhiteCardTint, snapshotWhiteCardColors } from "./whiteCardViewport";
import { uniformBuildingColor } from "./buildingUse";

describe("buildingViewportColor", () => {
  it("returns use colour by default", () => {
    expect(
      buildingViewportFill({ colourByUse: true, uniformBuildings: false, colourBySource: false }, "retail", undefined),
    ).toBe(BUILDING_USE_META.retail.color);
  });

  it("returns uniform grey when uniform mode is on", () => {
    expect(
      buildingViewportFill({ colourByUse: false, uniformBuildings: true, colourBySource: false }, "retail", undefined),
    ).toBe(uniformBuildingColor());
  });

  it("returns source colour when colouring by source", () => {
    expect(
      buildingViewportFill({ colourByUse: true, uniformBuildings: false, colourBySource: true }, undefined, "zone"),
    ).toBe(SOURCE_META.zone.color);
  });

  it("parses bucket names", () => {
    expect(parseBuildingBucketName("Buildings::Retail").use).toBe("retail");
    expect(parseBuildingBucketName("source:osm")).toEqual({ sourceKey: "osm" });
  });

  it("re-snapshots building and surface colours in-place when CSS colour tokens change without rebuilding geometry", () => {
    const group = new THREE.Group();
    const bldgMat = new THREE.MeshStandardMaterial({ color: "#aaaaaa" });
    const bldgMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bldgMat);
    bldgMesh.name = "Buildings::Residential";
    group.add(bldgMesh);

    const treeMat = new THREE.MeshStandardMaterial({ color: "#228833" });
    treeMat.name = "TreeCrowns";
    const treeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), treeMat);
    const treesGroup = new THREE.Group();
    treesGroup.name = "Trees";
    treesGroup.add(treeMesh);
    group.add(treesGroup);

    const mode = { colourByUse: true, uniformBuildings: false, colourBySource: false };
    snapshotBuildingViewportColors(group, mode);
    snapshotSunStudySurfaceColors(group);
    snapshotWhiteCardColors(group, mode);

    const origRes = COLOUR_FALLBACK["--use-residential"];
    const origTree = COLOUR_FALLBACK["--tree-crown"];
    (COLOUR_FALLBACK as Record<string, string>)["--use-residential"] = "#ff3366";
    (COLOUR_FALLBACK as Record<string, string>)["--tree-crown"] = "#11aaee";
    try {
      refreshSceneSurfaceColors(group);
      snapshotBuildingViewportColors(group, mode);
      snapshotSunStudySurfaceColors(group);
      snapshotWhiteCardColors(group, mode);
      applySunStudySurfaceTint(group, false);
      applyBuildingSolarNeutral(group, false, "#cccccc");
      applyWhiteCardTint(group, false);

      expect(`#${bldgMat.color.getHexString()}`).toBe("#ff3366");
      expect(`#${treeMat.color.getHexString()}`).toBe("#11aaee");
    } finally {
      (COLOUR_FALLBACK as Record<string, string>)["--use-residential"] = origRes;
      (COLOUR_FALLBACK as Record<string, string>)["--tree-crown"] = origTree;
    }
  });
});
