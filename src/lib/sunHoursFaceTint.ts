import * as THREE from "three";

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
