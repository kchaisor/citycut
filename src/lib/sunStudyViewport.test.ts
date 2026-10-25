import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyBuildingSolarNeutral } from "./buildingViewportColor";
import { getColour } from "./colours";
import { applySunStudySurfaceTint } from "./sunStudySurfaceViewport";
import { sunStudyViewportLighting } from "./sunStudyViewport";
import { applyWhiteCardTint } from "./whiteCardViewport";

describe("sunStudyViewportLighting", () => {
  it("uses pure white for the solar neutral building fill token", () => {
    expect(getColour("--building-solar-neutral").toUpperCase()).toBe("#FFFFFF");
  });

  it("uses full fill rig when shadows are off and keeps lighting identical when sun path toggles", () => {
    const off = sunStudyViewportLighting({ showPath: false, castShadows: false });
    const on = sunStudyViewportLighting({ showPath: true, castShadows: false });
    expect(off).toEqual({
      fillKeyLight: 1.35,
      fillAmbient: 0.28,
      fillHemi: 0.7,
      sunIntensity: 2.35,
      noToneMapping: false,
    });
    expect(on).toEqual(off);
  });

  it("uses shadow fill rig when shadows are on and keeps lighting, sun intensity, and tone mapping identical when sun path toggles", () => {
    const off = sunStudyViewportLighting({ showPath: false, castShadows: true });
    const on = sunStudyViewportLighting({ showPath: true, castShadows: true });
    expect(off).toEqual({
      fillKeyLight: 0,
      fillAmbient: 0.08,
      fillHemi: 0.34,
      sunIntensity: 2.35,
      noToneMapping: false,
    });
    expect(on).toEqual(off);
  });

  it("keeps building emissive, rail, and surface colours unchanged when sun path is toggled in the 3D scene", () => {
    const root = new THREE.Group();
    const buildings = new THREE.Group();
    buildings.name = "Buildings";
    const buildingMat = new THREE.MeshStandardMaterial({ color: "#b35c44" });
    const buildingMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), buildingMat);
    buildingMesh.userData.viewportFill = "#b35c44";
    buildingMesh.userData.whiteCardRestHex = "#b35c44";
    buildings.add(buildingMesh);

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 1),
      new THREE.MeshStandardMaterial({ color: "#888888" }),
    );
    rail.name = "Rail";
    rail.userData.sunStudyRestHex = "#888888";

    root.add(buildings, rail);

    applySunStudySurfaceTint(root, false);
    applyBuildingSolarNeutral(root, false, "#ffffff");
    applyWhiteCardTint(root, false);

    expect(buildingMat.color.getHexString()).toBe("b35c44");
    expect(buildingMat.emissive.getHex()).toBe(0x000000);
    expect(buildingMat.emissiveIntensity).toBe(1);
    expect((rail.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("888888");
  });
});
