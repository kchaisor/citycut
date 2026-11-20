import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applySolarGreyscale, greyscaleColour, linearLuminance } from "./solarGreyscale";

function isGrey(color: THREE.Color): boolean {
  return color.r === color.g && color.g === color.b;
}

describe("solar greyscale", () => {
  it("turns a fill into a luminance-preserving grey", () => {
    const green = new THREE.Color().setRGB(0.06, 0.26, 0.03);
    const y = linearLuminance(green.r, green.g, green.b);
    greyscaleColour(green);
    expect(isGrey(green)).toBe(true);
    expect(green.r).toBeCloseTo(y, 10);
  });

  it("greys trees, roads, terrain vertex colours and buildings when Solar Study is active and restores them after", () => {
    const root = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "#478c33" }));
    crown.name = "TreeCrowns";
    const road = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: "#c8a060" }));
    road.name = "Roads";
    const terrainGeometry = new THREE.BufferGeometry();
    terrainGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([0.2, 0.5, 0.1, 0.9, 0.8, 0.7]), 3));
    const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
    terrain.name = "Terrain";
    const building = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "#b35c44", emissive: "#203040" }));
    building.name = "Buildings";
    root.add(crown, road, terrain, building);

    const crownRest = (crown.material as THREE.MeshStandardMaterial).color.getHex();
    const buildingRest = (building.material as THREE.MeshStandardMaterial).color.getHex();
    const terrainRest = Array.from(terrainGeometry.getAttribute("color").array);

    applySolarGreyscale(root, true);
    applySolarGreyscale(root, true);
    expect(isGrey((crown.material as THREE.MeshStandardMaterial).color)).toBe(true);
    expect(isGrey((road.material as THREE.MeshBasicMaterial).color)).toBe(true);
    expect(isGrey((building.material as THREE.MeshStandardMaterial).color)).toBe(true);
    expect(isGrey((building.material as THREE.MeshStandardMaterial).emissive)).toBe(true);
    const terrainColours = terrainGeometry.getAttribute("color").array;
    expect(terrainColours[0]).toBe(terrainColours[1]);
    expect(terrainColours[1]).toBe(terrainColours[2]);
    expect(terrainColours[0]).toBeCloseTo(linearLuminance(0.2, 0.5, 0.1), 6);

    applySolarGreyscale(root, false);
    expect((crown.material as THREE.MeshStandardMaterial).color.getHex()).toBe(crownRest);
    expect((building.material as THREE.MeshStandardMaterial).color.getHex()).toBe(buildingRest);
    expect(Array.from(terrainGeometry.getAttribute("color").array)).toEqual(terrainRest);
  });

  it("greys the new colour when another tint repaints a material while greyscale is on", () => {
    const material = new THREE.MeshStandardMaterial({ color: "#478c33" });
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    applySolarGreyscale(root, true);
    material.color.setStyle("#ff0000");
    applySolarGreyscale(root, true);
    expect(material.color.r).toBeCloseTo(linearLuminance(1, 0, 0), 6);
    applySolarGreyscale(root, false);
    expect(material.color.getHexString()).toBe("ff0000");
  });

  it("leaves a fresh repaint alone when greyscale turns off", () => {
    const material = new THREE.MeshStandardMaterial({ color: "#478c33" });
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    applySolarGreyscale(root, true);
    material.color.setStyle("#3366cc");
    applySolarGreyscale(root, false);
    expect(material.color.getHexString()).toBe("3366cc");
  });
});
