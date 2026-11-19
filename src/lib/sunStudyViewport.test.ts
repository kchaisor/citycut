import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyBuildingSolarNeutral } from "./buildingViewportColor";
import { getColour } from "./colours";
import { applySunStudySurfaceTint } from "./sunStudySurfaceViewport";
import { studioSceneLighting, sunStudyViewportLighting } from "./sunStudyViewport";
import { applyPrimaryViewportTint, primaryViewportLighting } from "./primaryViewport";

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
    applyPrimaryViewportTint(root, false);

    expect(buildingMat.color.getHexString()).toBe("b35c44");
    expect(buildingMat.emissive.getHex()).toBe(0x000000);
    expect(buildingMat.emissiveIntensity).toBe(1);
    expect((rail.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("888888");
  });
});

describe("studioSceneLighting", () => {
  const base = { primaryView: true, showPath: true, castShadows: true, solarAnalysisActive: true, sunAboveHorizon: true };
  const shadowFill = (light: { fillAmbient: number; fillHemi: number; fillKeyLight: number }) =>
    light.fillAmbient + light.fillHemi + light.fillKeyLight;

  it("drops Primary studio fill under Solar Study shadows so the sun casts a dark shadow", () => {
    const light = studioSceneLighting(base);
    expect(light).toEqual({ fillKeyLight: 0, fillAmbient: 0.07, fillHemi: 0.2, sunIntensity: 6.5, noToneMapping: true });
    const primary = primaryViewportLighting(true);
    expect(shadowFill(light)).toBeLessThan(shadowFill(primary) / 6);
    expect(shadowFill(light)).toBeLessThan(0.6 * 0.5);
    expect(shadowFill(light)).toBeGreaterThan(0.15);
    const lowWinterSun = Math.sin((20 * Math.PI) / 180);
    const shadowed = shadowFill(light) / Math.PI;
    const lit = shadowed + (light.sunIntensity * lowWinterSun) / Math.PI;
    expect(shadowed).toBeLessThan(0.1);
    expect(lit).toBeGreaterThan(0.6);
    expect(lit / shadowed).toBeGreaterThan(7);
  });

  it("restores Primary studio lighting when Solar Study is not the active analysis", () => {
    const light = studioSceneLighting({ ...base, solarAnalysisActive: false });
    expect(light).toEqual({ ...primaryViewportLighting(true), sunIntensity: 2.35, noToneMapping: true });
  });

  it("keeps Primary studio lighting under Solar Study while shadows are off", () => {
    expect(studioSceneLighting({ ...base, castShadows: false })).toEqual({
      ...primaryViewportLighting(true),
      sunIntensity: 2.35,
      noToneMapping: true,
    });
  });

  it("uses the sun-study rig when Primary studio is off", () => {
    expect(studioSceneLighting({ ...base, primaryView: false })).toEqual(
      sunStudyViewportLighting({ showPath: true, castShadows: true }),
    );
  });

  it("goes to night with no sun before sunrise or after sunset under Solar Study", () => {
    for (const primaryView of [true, false]) {
      const night = studioSceneLighting({ ...base, primaryView, sunAboveHorizon: false });
      expect(night.sunIntensity).toBe(0);
      expect(night.fillKeyLight).toBe(0);
      expect(shadowFill(night)).toBeLessThan(shadowFill(primaryViewportLighting(true)) / 3);
    }
  });
});
