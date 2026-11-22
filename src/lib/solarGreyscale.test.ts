import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import {
  MONO_WATER_FILL,
  MONO_WATER_MESH_NAME,
  applySolarGreyscale,
  greyscaleColour,
  greyscaleHex,
  linearLuminance,
  monoSwatchColour,
  restoreFlatWater,
} from "./solarGreyscale";
import { DEFAULT_VIEW3D_DISPLAY, monoViewActive, selectViewStyle3d } from "./view3dDisplay";

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

  it("greys trees, roads, terrain vertex colours and buildings when the B&W view style is on and restores them after", () => {
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

  it("follows the B&W view style, not Solar Study: B&W greys the scene and Primary brings the colour back", () => {
    const material = new THREE.MeshStandardMaterial({ color: "#478c33" });
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const rest = material.color.getHex();

    applySolarGreyscale(root, monoViewActive(DEFAULT_VIEW3D_DISPLAY));
    expect(material.color.getHex()).toBe(rest);

    const mono = selectViewStyle3d(DEFAULT_VIEW3D_DISPLAY, "mono", false).display;
    applySolarGreyscale(root, monoViewActive(mono));
    expect(isGrey(material.color)).toBe(true);

    const primary = selectViewStyle3d(mono, "primary", false).display;
    applySolarGreyscale(root, monoViewActive(primary));
    expect(material.color.getHex()).toBe(rest);
  });

  it("names the flat B&W water grey", () => {
    expect(MONO_WATER_MESH_NAME).toBe("Water");
    expect(MONO_WATER_FILL).toBe("--water-3d-mono");
    expect(getColour(MONO_WATER_FILL)).toBe("#D6D6D2");
  });

  it("makes B&W water a flat, unlit #D6D6D2, leaves trees a mid-grey, and restores the real water material after", () => {
    const root = new THREE.Group();
    const waterMaterial = new THREE.MeshStandardMaterial({ color: "#7FBFFF", side: THREE.DoubleSide });
    waterMaterial.polygonOffset = true;
    waterMaterial.polygonOffsetFactor = -2;
    waterMaterial.polygonOffsetUnits = -3;
    const water: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(new THREE.BoxGeometry(), waterMaterial);
    water.name = "Water";
    const crown = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "#478c33" }));
    crown.name = "TreeCrowns";
    root.add(water, crown);

    applySolarGreyscale(root, true);
    applySolarGreyscale(root, true);
    const flat = water.material as THREE.MeshBasicMaterial;
    expect(flat).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(flat).not.toBe(waterMaterial);
    expect((flat as unknown as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial).toBeUndefined();
    expect(flat.toneMapped).toBe(false);
    expect(flat.color.getHexString()).toBe("d6d6d2");
    expect(flat.side).toBe(THREE.DoubleSide);
    expect(flat.polygonOffset).toBe(true);
    expect(flat.polygonOffsetFactor).toBe(-2);
    expect(flat.polygonOffsetUnits).toBe(-3);
    expect(waterMaterial.color.getHexString()).toBe("7fbfff");

    const crownColour = (crown.material as THREE.MeshStandardMaterial).color;
    expect(crown.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(isGrey(crownColour)).toBe(true);
    expect(crownColour.getHexString()).not.toBe("d6d6d2");
    expect(`#${crownColour.getHexString().toUpperCase()}`).toBe(greyscaleHex("#478c33"));

    applySolarGreyscale(root, false);
    expect(water.material).toBe(waterMaterial);
    expect(waterMaterial.color.getHexString()).toBe("7fbfff");
    expect(crownColour.getHexString()).toBe("478c33");
  });

  it("hands the real water material back for repainting, then flattens it again", () => {
    const waterMaterial = new THREE.MeshStandardMaterial({ color: "#7FBFFF" });
    const water: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(new THREE.BoxGeometry(), waterMaterial);
    water.name = "Water";
    const root = new THREE.Group().add(water);

    applySolarGreyscale(root, true);
    const flat = water.material;
    restoreFlatWater(root);
    expect(water.material).toBe(waterMaterial);
    waterMaterial.color.setStyle("#2277bb");
    applySolarGreyscale(root, true);
    expect(water.material).toBe(flat);
    expect((water.material as THREE.MeshBasicMaterial).color.getHexString()).toBe("d6d6d2");
    applySolarGreyscale(root, false);
    expect(waterMaterial.color.getHexString()).toBe("2277bb");
  });

  it("previews Scene Layers swatches with the same grey the 3D scene uses", () => {
    const scene = greyscaleColour(new THREE.Color("#478c33"));
    expect(greyscaleHex("#478c33")).toBe(`#${scene.getHexString().toUpperCase()}`);
    expect(monoSwatchColour("trees", "#478c33")).toBe(greyscaleHex("#478c33"));
    expect(monoSwatchColour("use:residential", "#b35c44")).toBe(greyscaleHex("#b35c44"));
    expect(monoSwatchColour("water", "#7FBFFF")).toBe("#D6D6D2");
    expect(monoSwatchColour("trees", "#478c33")).not.toBe("#D6D6D2");
  });
});
