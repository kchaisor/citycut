import * as THREE from "three";
import { BUILDING_EDGE_THRESHOLD_DEG } from "../buildingEdges";
import { getColour } from "../colours";
import type { CityModel } from "../../types";
import { floorLinesForBuilding } from "./floors";
import { knifePlane, knifePlaneInverted, planeCutRect, type SectionKnifePose } from "./plane";

type MatRest = {
  clippingPlanes: THREE.Plane[] | null;
  clipShadows: boolean;
  clipIntersection: boolean;
  visible: boolean;
};

type MeshRest = {
  material: THREE.Material | THREE.Material[];
  visible: boolean;
};

export type SectionKnifeClipMount = {
  capGroup: THREE.Group;
  farEdgeGroup: THREE.Group;
  cutEdge: THREE.LineSegments;
  floorLines: THREE.LineSegments;
  apply: (active: boolean, pose: SectionKnifePose) => void;
  dispose: () => void;
};

function cloneMaterial(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  cloned.clippingPlanes = null;
  cloned.clipIntersection = false;
  cloned.clipShadows = false;
  return cloned;
}

function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function setMeshMaterials(mesh: THREE.Mesh, materials: THREE.Material[]): void {
  mesh.material = materials.length === 1 ? materials[0] : materials;
}

function isSolidBatch(name: string): boolean {
  if (name === "BuildingEdges" || name === "GroundEdge" || name === "IntroCutRing" || name === "RoofLines") {
    return false;
  }
  if (name.startsWith("SectionKnife")) return false;
  return true;
}

function collectSolidMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (!isSolidBatch(mesh.name)) return;
    meshes.push(mesh);
  });
  return meshes;
}

export function mountSectionKnifeClip(city: THREE.Object3D, model: CityModel): SectionKnifeClipMount {
  const matRest = new WeakMap<THREE.Material, MatRest>();
  const meshRest = new WeakMap<THREE.Mesh, MeshRest>();
  const solids = collectSolidMeshes(city);
  const clipTargets: THREE.Mesh[] = [...solids];
  city.traverse((object) => {
    const instanced = object as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) return;
    if (!isSolidBatch(instanced.name)) return;
    clipTargets.push(instanced);
  });

  for (const mesh of clipTargets) {
    const materials = meshMaterials(mesh);
    meshRest.set(mesh, { material: mesh.material, visible: mesh.visible });
    const cloned = materials.map((material) => {
      if (!matRest.has(material)) {
        matRest.set(material, {
          clippingPlanes: material.clippingPlanes,
          clipShadows: material.clipShadows,
          clipIntersection: material.clipIntersection,
          visible: material.visible,
        });
      }
      return cloneMaterial(material);
    });
    setMeshMaterials(mesh, cloned);
  }

  const capGroup = new THREE.Group();
  capGroup.name = "SectionKnifeCap";
  const farEdgeGroup = new THREE.Group();
  farEdgeGroup.name = "SectionKnifeFarEdges";
  city.add(capGroup);
  city.add(farEdgeGroup);

  const poche = getColour("--section-knife-poche");
  const ink = getColour("--outline-building");

  for (const mesh of solids) {
    const capMat = new THREE.MeshBasicMaterial({
      color: poche,
      side: THREE.BackSide,
      clippingPlanes: null,
      clipShadows: true,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.IncrementWrapStencilOp,
      stencilZPass: THREE.IncrementWrapStencilOp,
    });
    const cap = new THREE.Mesh(mesh.geometry, capMat);
    cap.name = "SectionKnifeCapMesh";
    cap.position.copy(mesh.position);
    cap.rotation.copy(mesh.rotation);
    cap.scale.copy(mesh.scale);
    cap.renderOrder = mesh.renderOrder + 2;
    capGroup.add(cap);

    const edges = new THREE.EdgesGeometry(mesh.geometry, BUILDING_EDGE_THRESHOLD_DEG);
    const edgeMat = new THREE.LineBasicMaterial({
      color: ink,
      clippingPlanes: null,
      linewidth: 1,
    });
    const line = new THREE.LineSegments(edges, edgeMat);
    line.name = "SectionKnifeFarEdge";
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    line.scale.copy(mesh.scale);
    line.renderOrder = mesh.renderOrder + 3;
    farEdgeGroup.add(line);
  }

  const groundY = model.terrain ? model.terrain.min : 0;
  let topY = groundY + 30;
  for (const building of model.buildings) topY = Math.max(topY, groundY + building.height);

  const cutGeo = new THREE.BufferGeometry();
  const cutEdge = new THREE.LineSegments(
    cutGeo,
    new THREE.LineBasicMaterial({ color: getColour("--section-knife-cut-edge"), depthTest: true }),
  );
  cutEdge.name = "SectionKnifeCutEdge";
  cutEdge.renderOrder = 999;
  city.add(cutEdge);

  const floorGeo = new THREE.BufferGeometry();
  const floorLines = new THREE.LineSegments(
    floorGeo,
    new THREE.LineBasicMaterial({ color: getColour("--section-knife-floor-line") }),
  );
  floorLines.name = "SectionKnifeFloorLines";
  floorLines.renderOrder = 1000;
  capGroup.add(floorLines);

  const buildingEdges = city.getObjectByName("BuildingEdges");
  const groundEdge = city.getObjectByName("GroundEdge");

  function rebuildCutEdge(pose: SectionKnifePose) {
    const half = model.sideM * 0.55;
    const pts = planeCutRect(pose, half, groundY - 1, topY + 5);
    const pairs = [0, 1, 1, 3, 3, 2, 2, 0, 0, 2, 1, 3];
    const array = new Float32Array(pairs.length * 3);
    for (let i = 0; i < pairs.length; i++) {
      const p = pts[pairs[i]];
      array[i * 3] = p.x;
      array[i * 3 + 1] = p.y;
      array[i * 3 + 2] = p.z;
    }
    cutGeo.setAttribute("position", new THREE.BufferAttribute(array, 3));
    cutGeo.computeBoundingSphere();
  }

  function rebuildFloorLines(pose: SectionKnifePose) {
    const keep = knifePlane(pose);
    const normal = keep.normal;
    const positions: number[] = [];
    const sliceEps = 2.5;
    for (const building of model.buildings) {
      if (building.meshDrawnBy != null) continue;
      const ring = building.ring;
      let cx = 0;
      let cz = 0;
      for (const pt of ring) {
        cx += pt[0];
        cz += -pt[1];
      }
      cx /= ring.length;
      cz /= ring.length;
      const dist = normal.x * cx + normal.z * cz + keep.constant;
      if (Math.abs(dist) > sliceEps) continue;
      const base = groundY;
      const top = base + building.height;
      for (const line of floorLinesForBuilding(building, base, top)) {
        const span = 6;
        const originX = normal.x * pose.offsetM;
        const originZ = normal.z * pose.offsetM;
        const tangentX = -normal.z;
        const tangentZ = normal.x;
        for (const t of [-span, span]) {
          const x = originX + tangentX * t;
          const z = originZ + tangentZ * t;
          positions.push(x, line.yM, z);
        }
      }
    }
    floorGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions.length ? positions : [0, 0, 0, 0, 0, 0]), 3),
    );
    floorGeo.computeBoundingSphere();
  }

  function apply(active: boolean, pose: SectionKnifePose) {
    const keep = knifePlane(pose);
    const far = knifePlaneInverted(pose);
    capGroup.visible = active;
    farEdgeGroup.visible = active;
    cutEdge.visible = active;
    floorLines.visible = active;
    if (active) {
      if (buildingEdges && buildingEdges.userData.sectionKnifeRestVisible === undefined) {
        buildingEdges.userData.sectionKnifeRestVisible = buildingEdges.visible;
      }
      if (groundEdge && groundEdge.userData.sectionKnifeRestVisible === undefined) {
        groundEdge.userData.sectionKnifeRestVisible = groundEdge.visible;
      }
      if (buildingEdges) buildingEdges.visible = false;
      if (groundEdge) groundEdge.visible = false;
      rebuildCutEdge(pose);
      rebuildFloorLines(pose);
    } else {
      if (buildingEdges && buildingEdges.userData.sectionKnifeRestVisible !== undefined) {
        buildingEdges.visible = buildingEdges.userData.sectionKnifeRestVisible;
      }
      if (groundEdge && groundEdge.userData.sectionKnifeRestVisible !== undefined) {
        groundEdge.visible = groundEdge.userData.sectionKnifeRestVisible;
      }
    }

    for (const mesh of clipTargets) {
      const materials = meshMaterials(mesh);
      for (const material of materials) {
        if (active) {
          material.clippingPlanes = [keep];
          material.clipShadows = true;
          material.clipIntersection = false;
        } else {
          const rest = matRest.get(material);
          material.clippingPlanes = rest?.clippingPlanes ?? null;
          material.clipShadows = rest?.clipShadows ?? false;
          material.clipIntersection = rest?.clipIntersection ?? false;
        }
        material.needsUpdate = true;
      }
    }

    capGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat?.clippingPlanes !== undefined) {
        mat.clippingPlanes = active ? [keep] : null;
        mat.needsUpdate = true;
      }
    });

    farEdgeGroup.traverse((object) => {
      const line = object as THREE.LineSegments;
      if (!line.isLineSegments) return;
      const mat = line.material as THREE.LineBasicMaterial;
      mat.clippingPlanes = active ? [far] : null;
      mat.needsUpdate = true;
    });
  }

  function dispose() {
    capGroup.removeFromParent();
    farEdgeGroup.removeFromParent();
    cutEdge.removeFromParent();
    for (const mesh of clipTargets) {
      const rest = meshRest.get(mesh);
      if (rest) {
        mesh.material = rest.material;
        mesh.visible = rest.visible;
      }
    }
    farEdgeGroup.traverse((object) => {
      const line = object as THREE.LineSegments;
      if (line.isLineSegments && line.geometry !== cutGeo) line.geometry?.dispose?.();
    });
    cutGeo.dispose();
    floorGeo.dispose();
  }

  return { capGroup, farEdgeGroup, cutEdge, floorLines, apply, dispose };
}
