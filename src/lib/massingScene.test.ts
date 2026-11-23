import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { mgaCrs } from "./crsZone";
import { getColour } from "./colours";
import { BUILDING_EDGE_COLOR } from "./buildingEdges";
import { qaSchemeMassing } from "./qaSchemeFixture";
import { buildMassingGroup, IMPORTED_EDGE_PX } from "./massingScene";
import type { ImportedMassing } from "./massingImport";

const origin = { lon: 144.9645, lat: -37.8216 };
const zone = mgaCrs(origin.lon).zone;

function hide(massing: ImportedMassing, name: string): ImportedMassing {
  return {
    ...massing,
    buildings: massing.buildings.map((building) => (building.name === name ? { ...building, visible: false } : building)),
  };
}

function outlines(group: THREE.Group): LineSegments2[] {
  return group.children.filter((child) => (child as LineSegments2).isLineSegments2) as LineSegments2[];
}

function fills(group: THREE.Group): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] {
  return group.children.filter((child) => child.userData.importedBuildingId != null) as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >[];
}

describe("imported masses in 3D", () => {
  it("keeps a 1.5px ink outline on every building in both colour modes", () => {
    for (const colour of [undefined, "#3366CC"]) {
      const group = buildMassingGroup([{ ...qaSchemeMassing(0), colour }], origin, zone)!;
      const lines = outlines(group);
      expect(lines.map((line) => line.name)).toEqual(["Tower A outline", "Podium outline", "Tower B outline"]);
      for (const line of lines) {
        const material = line.material as LineMaterial;
        expect(material.linewidth).toBe(IMPORTED_EDGE_PX);
        expect(material.color.getHex()).toBe(new THREE.Color(BUILDING_EDGE_COLOR).getHex());
        expect(line.geometry.getAttribute("instanceStart").count).toBeGreaterThanOrEqual(12);
      }
      for (const fill of fills(group)) expect(fill.material.polygonOffset).toBe(true);
    }
  });

  it("shows the imported white by default, and the file colour on every building in single colour", () => {
    const byDefault = fills(buildMassingGroup([qaSchemeMassing(0)], origin, zone)!);
    expect(byDefault.map((fill) => `#${fill.material.color.getHexString()}`.toUpperCase())).toEqual([
      getColour("--imported-massing").toUpperCase(),
      getColour("--imported-massing").toUpperCase(),
      getColour("--imported-massing").toUpperCase(),
    ]);
    const single = fills(buildMassingGroup([{ ...qaSchemeMassing(0), colour: "#3366CC" }], origin, zone)!);
    expect(single.map((fill) => `#${fill.material.color.getHexString()}`.toUpperCase())).toEqual([
      "#3366CC",
      "#3366CC",
      "#3366CC",
    ]);
  });

  it("leaves a hidden building out of the scene", () => {
    const group = buildMassingGroup([hide(qaSchemeMassing(0), "Tower B")], origin, zone)!;
    expect(fills(group).map((fill) => fill.userData.importedBuildingId)).toEqual([
      "layer:Scheme A::Tower A",
      "layer:Scheme A::Podium",
    ]);
  });

  it("never picks an outline instead of the building", () => {
    const group = buildMassingGroup([qaSchemeMassing(0)], origin, zone)!;
    const hits: THREE.Intersection[] = [];
    for (const line of outlines(group)) line.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });
});
