import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mgaCrs } from "./crsZone";
import { qaMassingFromSearch } from "./qaCameraBridge";
import { qaSchemeMassing, parsedFromSnapshot, type ParsedMassingSnapshot } from "./qaSchemeFixture";
import snapshot from "./__fixtures__/rhino-three-buildings.parsed.json";
import { importedMassingFromStored, storedBuildingState } from "./massingStore";
import { buildMassingGroup } from "./massingScene";
import { pickSceneSelectionFromHits } from "./sceneInspectPick";

const origin = { lon: 144.9645, lat: -37.8216 };
const zone = mgaCrs(origin.lon).zone;

describe("imported building selection and storage", () => {
  it("only turns on the scheme fixture in QA mode", () => {
    expect(qaMassingFromSearch("?qaMassing=scheme")).toBeNull();
    expect(qaMassingFromSearch("?qa=1&qaMassing=scheme")).toBe("scheme");
    expect(qaMassingFromSearch("?qaMassing=podium")).toBe("podium");
  });

  it("keeps a hidden building across reloads", () => {
    const massing = qaSchemeMassing(0);
    const edited = massing.buildings.map((building) =>
      building.name === "Podium" ? { ...building, visible: false } : building,
    );
    const reloaded = importedMassingFromStored(parsedFromSnapshot(snapshot as ParsedMassingSnapshot), {
      id: massing.id,
      name: massing.name,
      bytes: new ArrayBuffer(1),
      mode: massing.mode,
      placement: massing.placement,
      visible: true,
      buildings: storedBuildingState(edited),
    });
    const podium = reloaded.buildings.find((building) => building.name === "Podium")!;
    expect(podium.visible).toBe(false);
    expect(reloaded.buildings.every((building) => building.use === null)).toBe(true);
  });

  it("picks the imported building under the pointer in 3D", () => {
    const group = buildMassingGroup([qaSchemeMassing(0)], origin, zone)!;
    group.updateMatrixWorld(true);
    const towerB = group.children.find((child) => child.name === "Tower B")! as THREE.Mesh;
    towerB.geometry.computeBoundingBox();
    const centre = towerB.geometry.boundingBox!.getCenter(new THREE.Vector3());
    const raycaster = new THREE.Raycaster(new THREE.Vector3(centre.x, 500, centre.z), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(group, true);
    const selection = pickSceneSelectionFromHits(hits, { trees: [], sideM: 500 }, 10, 20, false);
    expect(selection).toMatchObject({ kind: "imported", fileId: "qa-scheme", buildingId: "text:Tower B" });
  });
});
