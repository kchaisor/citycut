import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { mgaCrs } from "./crsZone";
import { getColour } from "./colours";
import { BUILDING_EDGE_COLOR } from "./buildingEdges";
import { qaSchemeMassing } from "./qaSchemeFixture";
import { buildMassingGroup, IMPORTED_EDGE_PX } from "./massingScene";
import {
  importedLabelAnchors,
  importedLabelOccluders,
  IMPORTED_LABEL_LIFT_PX,
  projectImportedLabels,
} from "./importedLabels";
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

  it("shows use colours by use, and the file colour on every building in single colour", () => {
    const byUse = fills(buildMassingGroup([qaSchemeMassing(0)], origin, zone)!);
    expect(byUse.map((fill) => `#${fill.material.color.getHexString()}`.toUpperCase())).toEqual([
      getColour("--use-residential").toUpperCase(),
      getColour("--use-unclassified").toUpperCase(),
      getColour("--use-commercial").toUpperCase(),
    ]);
    const single = fills(buildMassingGroup([{ ...qaSchemeMassing(0), colour: "#3366CC" }], origin, zone)!);
    expect(single.map((fill) => `#${fill.material.color.getHexString()}`.toUpperCase())).toEqual([
      "#3366CC",
      "#3366CC",
      "#3366CC",
    ]);
  });

  it("never picks an outline instead of the building", () => {
    const group = buildMassingGroup([qaSchemeMassing(0)], origin, zone)!;
    const hits: THREE.Intersection[] = [];
    for (const line of outlines(group)) line.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });
});

describe("imported building name labels", () => {
  it("anchors one label at each visible building's roof and drops hidden ones", () => {
    const all = importedLabelAnchors(buildMassingGroup([qaSchemeMassing(0)], origin, zone));
    expect(all.map((anchor) => anchor.name)).toEqual(["Tower A", "Podium", "Tower B"]);
    expect(all.map((anchor) => anchor.points[0]!.y)).toEqual([
      expect.closeTo(86, 3),
      expect.closeTo(18, 3),
      expect.closeTo(62, 3),
    ]);
    expect(all.every((anchor) => anchor.fileId === "qa-scheme")).toBe(true);
    const shown = importedLabelAnchors(buildMassingGroup([hide(qaSchemeMassing(0), "Tower B")], origin, zone));
    expect(shown.map((anchor) => anchor.buildingId)).toEqual(["layer:Scheme A::Tower A", "layer:Scheme A::Podium"]);
    expect(importedLabelAnchors(null)).toEqual([]);
  });

  it("projects roofs to the screen just above the roof and skips points off screen", () => {
    const anchors = importedLabelAnchors(buildMassingGroup([qaSchemeMassing(0)], origin, zone));
    const towerA = anchors[0]!.points[0]!;
    const camera = new THREE.PerspectiveCamera(45, 2, 1, 5000);
    camera.position.set(towerA.x, towerA.y + 300, towerA.z + 400);
    camera.lookAt(towerA);
    const labels = projectImportedLabels(anchors, camera, { left: 10, top: 20, width: 800, height: 400 });
    expect(labels.map((label) => label.name)).toEqual(["Tower A", "Podium", "Tower B"]);
    expect(labels[0]!.x).toBeCloseTo(410, 0);
    expect(labels[0]!.y).toBeCloseTo(220 - IMPORTED_LABEL_LIFT_PX, 0);
    camera.lookAt(towerA.x + 5000, towerA.y, towerA.z);
    expect(projectImportedLabels(anchors, camera, { left: 0, top: 0, width: 800, height: 400 })).toEqual([]);
  });

  it("hides a label whose roof sits behind a map building, but not behind its own walls", () => {
    const group = buildMassingGroup([qaSchemeMassing(0)], origin, zone)!;
    const anchors = importedLabelAnchors(group);
    const towerB = anchors[2]!.points[0]!;
    const camera = new THREE.PerspectiveCamera(45, 2, 1, 5000);
    camera.position.set(towerB.x, towerB.y + 40, towerB.z + 300);
    camera.lookAt(towerB);
    const rect = { left: 0, top: 0, width: 800, height: 400 };
    const open = projectImportedLabels(anchors, camera, rect, importedLabelOccluders(null, group));
    expect(open.map((label) => label.name)).toContain("Tower B");
    const city = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 400, 4));
    wall.position.set(towerB.x, 0, towerB.z + 150);
    wall.userData.buildingId = 7;
    city.add(wall);
    city.updateMatrixWorld(true);
    const blocked = projectImportedLabels(anchors, camera, rect, importedLabelOccluders(city, group));
    expect(blocked.map((label) => label.name)).not.toContain("Tower B");
  });

  it("moves a label to another part of the roof when its centre is hidden behind a taller neighbour", () => {
    const group = buildMassingGroup([qaSchemeMassing(0)], origin, zone)!;
    const anchors = importedLabelAnchors(group);
    const podium = anchors[1]!;
    const [centre, ...corners] = podium.points;
    expect(corners.every((corner) => corner.y === centre!.y)).toBe(true);
    const camera = new THREE.PerspectiveCamera(45, 2, 1, 5000);
    camera.position.set(centre!.x, centre!.y + 60, centre!.z + 200);
    camera.lookAt(centre!);
    const rect = { left: 0, top: 0, width: 800, height: 400 };
    const city = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(2, 400, 2));
    post.position.set(centre!.x, 0, centre!.z + 100);
    post.userData.buildingId = 9;
    city.add(post);
    city.updateMatrixWorld(true);
    const [label] = projectImportedLabels([podium], camera, rect, importedLabelOccluders(city, group));
    const [direct] = projectImportedLabels([podium], camera, rect);
    expect(label?.name).toBe("Podium");
    expect(label!.x).not.toBeCloseTo(direct!.x, 0);
  });
});
