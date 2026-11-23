import * as THREE from "three";
import { hideBuildingsForHeightEdit } from "./buildingHeightEditVisibility";

export function isCityBuildingFillName(name: string): boolean {
  return (
    name === "Buildings" ||
    name === "Buildings-manual" ||
    name === "Buildings-site" ||
    name.startsWith("Buildings::") ||
    name.startsWith("source:")
  );
}

export function setSunHoursMassingFillVisible(
  cityRoot: THREE.Object3D,
  importedRoot: THREE.Object3D | null | undefined,
  buildingsVisible: boolean,
  showOutlines: boolean,
  sunHoursFacesOn: boolean,
): void {
  const fillVisible = buildingsVisible && !sunHoursFacesOn;
  cityRoot.traverse((object) => {
    const name = object.name;
    if (name === "BuildingEdges") {
      object.visible = showOutlines && buildingsVisible;
      return;
    }
    if (isCityBuildingFillName(name)) object.visible = fillVisible;
  });
  importedRoot?.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.visible = fillVisible;
      return;
    }
    if (object.name.endsWith(" outline")) object.visible = showOutlines && buildingsVisible;
  });
}

export function hidePickedMassingForSunHours(
  roots: readonly (THREE.Object3D | null | undefined)[],
  buildingIds: readonly number[],
): () => void {
  const restores = roots.flatMap((root) =>
    root ? [hideBuildingsForHeightEdit(root, buildingIds, { keepEdges: true })] : [],
  );
  return () => {
    for (const restore of restores) restore();
  };
}
