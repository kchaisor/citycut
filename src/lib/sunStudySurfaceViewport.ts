import * as THREE from "three";
import { drawingSheetColor } from "./drawingSheet";
import { getColour } from "./colours";
import { applyMatteFinish } from "./matteMaterial";


const SURFACE_MESH_NAMES = new Set(["Terrain", "Ground", "Green", "Water", "Roads", "Rail"]);

function isSunStudySurfaceMesh(mesh: THREE.Mesh): boolean {
  if (SURFACE_MESH_NAMES.has(mesh.name)) return true;
  const parentName = mesh.parent?.name ?? "";
  return SURFACE_MESH_NAMES.has(parentName);
}

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

function snapshotTerrainVertexColors(mesh: THREE.Mesh): void {
  const attr = mesh.geometry.getAttribute("color");
  if (!attr || mesh.userData.sunStudyVertexColors) return;
  mesh.userData.sunStudyVertexColors = new Float32Array(attr.array);
}

function applyTerrainVertexWhite(mesh: THREE.Mesh, sunStudyOn: boolean): void {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const base = mesh.userData.sunStudyVertexColors as Float32Array | undefined;
  if (!attr || !base) return;
  if (sunStudyOn) {
    for (let i = 0; i < base.length; i += 3) {
      attr.array[i] = 1;
      attr.array[i + 1] = 1;
      attr.array[i + 2] = 1;
    }
  } else {
    attr.array.set(base);
  }
  attr.needsUpdate = true;
}

function snapshotMaterialViewportColor(material: THREE.MeshStandardMaterial): void {
  material.userData.sunStudyRestHex = `#${material.color.getHexString()}`;
}

function sunStudyColorForMesh(mesh: THREE.Mesh): string {
  if (mesh.name === "Water") return getColour("--water-sunpath");
  return getColour("--sun-study-surface");
}

function applyMaterialViewportTint(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, sunStudyOn: boolean): void {
  const rest = material.userData.sunStudyRestHex as string | undefined;
  if (!rest) return;
  if (sunStudyOn) {
    material.color.setStyle(sunStudyColorForMesh(mesh));
  } else {
    material.color.setStyle(rest);
  }
  applyMatteFinish(material);
}

/** Remember terrain vertex colours and ground material colours before any sun-study tint. */
export function snapshotSunStudySurfaceColors(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isSunStudySurfaceMesh(mesh)) return;
    if (mesh.name === "Terrain") snapshotTerrainVertexColors(mesh);
    forEachStandardMaterial(mesh, snapshotMaterialViewportColor);
  });
}

/** White ground, roads, and parks during sun study; water uses --water-sunpath. Buildings stay separate. */
export function applySunStudySurfaceTint(root: THREE.Object3D, sunStudyOn: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isSunStudySurfaceMesh(mesh)) return;
    if (mesh.name === "Terrain") {
      applyTerrainVertexWhite(mesh, sunStudyOn);
      return;
    }
    forEachStandardMaterial(mesh, (material) => applyMaterialViewportTint(mesh, material, sunStudyOn));
  });
}

/** Resolve the viewport tint for tests. */
export function sunStudyViewportFill(meshName: string, sunStudyOn: boolean): string | null {
  if (!sunStudyOn) return null;
  if (meshName === "Water") return getColour("--water-sunpath");
  if (SURFACE_MESH_NAMES.has(meshName)) return getColour("--sun-study-surface");
  return null;
}

/** Refresh non-building surface, tree, and transport colours in-place from current CSS colour tokens. */
export function refreshSceneSurfaceColors(root: THREE.Object3D): void {
  const groundFill = getColour("--ground-fill");
  const blockFill = getColour("--block-fill");
  const greenFill = getColour("--green-3d");
  const waterFill = getColour("--water-3d");
  const roadLocal = getColour("--road-local");
  const roadArterial = getColour("--road-arterial");
  const roadPath = getColour("--road-path");
  const treeTrunk = getColour("--tree-trunk");
  const treeCrown = getColour("--tree-crown");
  const railColor = getColour("--rail-fill");
  const tramColor = getColour("--tram-line-stroke");
  const siteBoundaryColor = getColour("--site-boundary");
  const buildingEdgeColor = drawingSheetColor("--building-edge");
  const groundEdgeColor = getColour("--ground-edge");

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const name = mesh.name || mesh.parent?.name || "";
      if (name === "Ground" || name === "BasePlinth") {
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(groundFill);
          applyMatteFinish(mat);
        });
      } else if (name === "Blocks") {
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(blockFill);
          applyMatteFinish(mat);
        });
      } else if (name === "Green") {
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(greenFill);
          applyMatteFinish(mat);
        });
      } else if (name === "Water") {
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(waterFill);
          applyMatteFinish(mat);
        });
      } else if (name === "Roads") {
        const grade = mesh.userData.roadGrade as string | undefined;
        const fill = grade === "path" ? roadPath : grade === "arterial" ? roadArterial : roadLocal;
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(fill);
          applyMatteFinish(mat);
        });
      } else if (mesh.name === "TreeTrunks" || (mesh.material as THREE.Material)?.name === "TreeTrunks") {
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(treeTrunk);
          applyMatteFinish(mat);
        });
      } else if (mesh.name === "TreeCrowns" || (mesh.material as THREE.Material)?.name === "TreeCrowns") {
        forEachStandardMaterial(mesh, (mat) => {
          mat.color.setStyle(treeCrown);
        });
      }
      return;
    }
    const line = object as THREE.LineSegments;
    if (line.isLineSegments || (object as THREE.Line).isLine) {
      const mat = line.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial | undefined;
      if (!mat || !mat.color) return;
      if (line.name === "RailLines") mat.color.setStyle(railColor);
      else if (line.name === "TramLines") mat.color.setStyle(tramColor);
      else if (line.name === "Site::Boundary") mat.color.setStyle(siteBoundaryColor);
      else if (line.name === "BuildingEdges" || line.name === "RoofLines") mat.color.setStyle(buildingEdgeColor);
      else if (line.name === "GroundEdge") mat.color.setStyle(groundEdgeColor);
    }
  });
}
