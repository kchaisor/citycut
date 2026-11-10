import * as THREE from "three";
import { getColour } from "../colours";
import type { CityModel } from "../../types";
import { knifePlane, knifePlaneInverted, planeCutRect, type SectionKnifePose } from "./plane";
import { collectSectionProfiles, type SectionProfile } from "./profiles";

type MatRest = {
  clippingPlanes: THREE.Plane[] | null;
  clipShadows: boolean;
  clipIntersection: boolean;
};

type MeshRest = {
  material: THREE.Material | THREE.Material[];
};

const contourRestPositions = new WeakMap<THREE.LineSegments, Float32Array>();

function planeSignedDistance(plane: THREE.Plane, x: number, y: number, z: number): number {
  return plane.normal.x * x + plane.normal.y * y + plane.normal.z * z + plane.constant;
}

function clipContourSegmentsToKeep(positions: Float32Array, plane: THREE.Plane): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < positions.length; i += 6) {
    const ax = positions[i]!;
    const ay = positions[i + 1]!;
    const az = positions[i + 2]!;
    const bx = positions[i + 3]!;
    const by = positions[i + 4]!;
    const bz = positions[i + 5]!;
    const da = planeSignedDistance(plane, ax, ay, az);
    const db = planeSignedDistance(plane, bx, by, bz);
    const keepA = da >= -0.05;
    const keepB = db >= -0.05;
    if (keepA && keepB) {
      out.push(ax, ay, az, bx, by, bz);
    } else if (keepA !== keepB) {
      const t = da / (da - db);
      const ix = ax + (bx - ax) * t;
      const iy = ay + (by - ay) * t;
      const iz = az + (bz - az) * t;
      if (keepA) out.push(ax, ay, az, ix, iy, iz);
      else out.push(ix, iy, iz, bx, by, bz);
    }
  }
  return new Float32Array(out.length ? out : [0, 0, 0, 0, 0, 1]);
}

function applyContourGeometryClip(mesh: THREE.LineSegments, plane: THREE.Plane | null, active: boolean) {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const positionAttr = geo.getAttribute("position");
  if (!positionAttr) return;
  let rest = contourRestPositions.get(mesh);
  if (!rest) {
    rest = (positionAttr.array as Float32Array).slice();
    contourRestPositions.set(mesh, rest);
  }
  if (!active || !plane) {
    geo.setAttribute("position", new THREE.BufferAttribute(rest.slice(), 3));
    geo.computeBoundingSphere();
    return;
  }
  const clipped = clipContourSegmentsToKeep(rest, plane);
  geo.setAttribute("position", new THREE.BufferAttribute(clipped, 3));
  geo.deleteAttribute("lineDistance");
  geo.computeBoundingSphere();
}

type ClipTarget = THREE.Mesh | THREE.Line;

function isClipLineName(name: string): boolean {
  return (
    name === "Contours3d" ||
    name === "Site::Boundary" ||
    name === "RailLines" ||
    name === "TramLines" ||
    name === "RoofLines" ||
    name === "BuildingEdges" ||
    name === "GroundEdge"
  );
}

export type SectionKnifeClipApplyResult = {
  lineClipOk: boolean;
  contourPresent: boolean;
  contourClipped: boolean;
};

export type SectionKnifeClipMount = {
  apply: (active: boolean, pose: SectionKnifePose) => SectionKnifeClipApplyResult;
  dispose: () => void;
};

function isSolidBatch(name: string): boolean {
  if (name === "BuildingEdges" || name === "GroundEdge" || name === "IntroCutRing" || name === "RoofLines") {
    return false;
  }
  if (name.startsWith("SectionKnife")) return false;
  return true;
}

function meshMaterials(target: ClipTarget): THREE.Material[] {
  return Array.isArray(target.material) ? target.material : [target.material];
}

function setMeshMaterials(target: ClipTarget, materials: THREE.Material[]): void {
  target.material = materials.length === 1 ? materials[0] : materials;
}

function cloneMaterial(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  cloned.clippingPlanes = null;
  cloned.clipShadows = false;
  cloned.clipIntersection = false;
  return cloned;
}

function worldPoint(_profile: SectionProfile, tangent: number, y: number, originX: number, originZ: number, tangentV: { x: number; z: number }) {
  return new THREE.Vector3(originX + tangentV.x * tangent, y, originZ + tangentV.z * tangent);
}

function rebuildPocheMeshes(
  profiles: SectionProfile[],
  axis: { originX: number; originZ: number; tangent: { x: number; z: number } },
  pocheGroup: THREE.Group,
  pocheMat: THREE.MeshBasicMaterial,
) {
  while (pocheGroup.children.length) {
    const child = pocheGroup.children[0]!;
    pocheGroup.remove(child);
    if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
  }
  for (const profile of profiles) {
    const a = worldPoint(profile, profile.tangentMin, profile.baseY, axis.originX, axis.originZ, axis.tangent);
    const b = worldPoint(profile, profile.tangentMax, profile.baseY, axis.originX, axis.originZ, axis.tangent);
    const c = worldPoint(profile, profile.tangentMax, profile.topY, axis.originX, axis.originZ, axis.tangent);
    const d = worldPoint(profile, profile.tangentMin, profile.topY, axis.originX, axis.originZ, axis.tangent);
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
      a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, pocheMat);
    mesh.name = "SectionKnifePoche";
    mesh.renderOrder = 850;
    pocheGroup.add(mesh);
  }
}

function rebuildCutLines(
  profiles: SectionProfile[],
  axis: { originX: number; originZ: number; tangent: { x: number; z: number } },
  cutGroup: THREE.LineSegments,
  cutGlow: THREE.LineSegments,
  floorGroup: THREE.LineSegments,
  cutColor: THREE.ColorRepresentation,
  floorColor: THREE.ColorRepresentation,
) {
  const cutPositions: number[] = [];
  const floorPositions: number[] = [];
  for (const profile of profiles) {
    const bl = worldPoint(profile, profile.tangentMin, profile.baseY, axis.originX, axis.originZ, axis.tangent);
    const br = worldPoint(profile, profile.tangentMax, profile.baseY, axis.originX, axis.originZ, axis.tangent);
    const tl = worldPoint(profile, profile.tangentMin, profile.topY, axis.originX, axis.originZ, axis.tangent);
    const tr = worldPoint(profile, profile.tangentMax, profile.topY, axis.originX, axis.originZ, axis.tangent);
    cutPositions.push(bl.x, bl.y, bl.z, br.x, br.y, br.z, br.x, br.y, br.z, tr.x, tr.y, tr.z, tr.x, tr.y, tr.z, tl.x, tl.y, tl.z, tl.x, tl.y, tl.z, bl.x, bl.y, bl.z);
    cutPositions.push(bl.x, bl.y, bl.z, tl.x, tl.y, tl.z, br.x, br.y, br.z, tr.x, tr.y, tr.z);
    for (const floor of profile.floors) {
      const fl = worldPoint(profile, profile.tangentMin, floor.yM, axis.originX, axis.originZ, axis.tangent);
      const fr = worldPoint(profile, profile.tangentMax, floor.yM, axis.originX, axis.originZ, axis.tangent);
      floorPositions.push(fl.x, fl.y, fl.z, fr.x, fr.y, fr.z);
    }
  }
  const buf = new Float32Array(cutPositions.length ? cutPositions : [0, 0, 0, 0, 0, 0]);
  const cutGeo = cutGroup.geometry as THREE.BufferGeometry;
  cutGeo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  (cutGroup.geometry as THREE.BufferGeometry).computeBoundingSphere();
  (cutGroup.material as THREE.LineBasicMaterial).color.set(cutColor);
  cutGroup.renderOrder = 920;
  const glowGeo = cutGlow.geometry as THREE.BufferGeometry;
  glowGeo.setAttribute("position", new THREE.BufferAttribute(buf.slice(), 3));
  (cutGlow.material as THREE.LineBasicMaterial).color.set(cutColor);
  cutGlow.renderOrder = 921;

  const floorGeo = floorGroup.geometry as THREE.BufferGeometry;
  floorGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(floorPositions.length ? floorPositions : [0, 0, 0, 0, 0, 0]), 3),
  );
  (floorGroup.material as THREE.LineBasicMaterial).color.set(floorColor);
  floorGroup.renderOrder = 910;
}

function rebuildPlaneFrame(
  pose: SectionKnifePose,
  model: CityModel,
  groundY: number,
  topY: number,
  frameLine: THREE.LineSegments,
) {
  const half = model.sideM * 0.52;
  const pts = planeCutRect(pose, half, groundY - 0.5, topY + 8);
  const pairs = [0, 1, 1, 3, 3, 2, 2, 0, 0, 2, 1, 3];
  const array = new Float32Array(pairs.length * 3);
  for (let i = 0; i < pairs.length; i++) {
    const p = pts[pairs[i]!]!;
    array[i * 3] = p.x;
    array[i * 3 + 1] = p.y;
    array[i * 3 + 2] = p.z;
  }
  const geo = frameLine.geometry as THREE.BufferGeometry;
  geo.setAttribute("position", new THREE.BufferAttribute(array, 3));
}

function registerClipMeshes(
  roots: THREE.Object3D[],
  clipTargets: ClipTarget[],
  matRest: WeakMap<THREE.Material, MatRest>,
  meshRest: WeakMap<ClipTarget, MeshRest>,
  solidOnly: boolean,
) {
  for (const root of roots) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const line = object as THREE.Line;
      const name = object.name;
      let target: ClipTarget | null = null;
      if (mesh.isMesh) {
        if (!solidOnly || isSolidBatch(name)) target = mesh;
      } else if (line.isLine && (!solidOnly || isClipLineName(name))) {
        target = line;
      }
      if (!target || clipTargets.includes(target)) return;
      clipTargets.push(target);
    });
  }
  for (const mesh of clipTargets) {
    if (meshRest.has(mesh)) continue;
    const materials = meshMaterials(mesh);
    meshRest.set(mesh, { material: mesh.material });
    const cloned = materials.map((material) => {
      if (!matRest.has(material)) {
        matRest.set(material, {
          clippingPlanes: material.clippingPlanes,
          clipShadows: material.clipShadows,
          clipIntersection: material.clipIntersection,
        });
      }
      return cloneMaterial(material);
    });
    setMeshMaterials(mesh, cloned);
  }
}

export function mountSectionKnifeClip(
  city: THREE.Object3D,
  model: CityModel,
  extraClipRoots: THREE.Object3D[] = [],
): SectionKnifeClipMount {
  const matRest = new WeakMap<THREE.Material, MatRest>();
  const meshRest = new WeakMap<ClipTarget, MeshRest>();
  const clipTargets: ClipTarget[] = [];
  registerClipMeshes([city], clipTargets, matRest, meshRest, true);
  registerClipMeshes(extraClipRoots, clipTargets, matRest, meshRest, false);

  const pocheGroup = new THREE.Group();
  pocheGroup.name = "SectionKnifePocheGroup";
  const cutGroup = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: getColour("--section-knife-cut-edge"),
      depthTest: true,
      depthWrite: false,
    }),
  );
  cutGroup.name = "SectionKnifeCutOutline";
  const cutGlow = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: getColour("--section-knife-cut-edge"),
      depthTest: false,
      transparent: true,
      opacity: 0.55,
    }),
  );
  cutGlow.name = "SectionKnifeCutGlow";
  const floorGroup = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: getColour("--section-knife-floor-line"), depthTest: true }),
  );
  floorGroup.name = "SectionKnifeFloorLines";
  const frameLine = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: getColour("--section-knife-cut-edge"), transparent: true, opacity: 0.85 }),
  );
  frameLine.name = "SectionKnifePlaneFrame";

  const pocheMat = new THREE.MeshBasicMaterial({
    color: getColour("--section-knife-poche"),
    side: THREE.DoubleSide,
    depthWrite: true,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.IncrementWrapStencilOp,
    stencilZPass: THREE.IncrementWrapStencilOp,
  });

  city.add(pocheGroup);
  city.add(cutGroup);
  city.add(cutGlow);
  city.add(floorGroup);
  city.add(frameLine);

  const buildingEdges = city.getObjectByName("BuildingEdges") as THREE.LineSegments | null;
  const groundEdge = city.getObjectByName("GroundEdge") as THREE.LineSegments | null;
  let farBuildingInk: THREE.LineSegments | null = null;
  let farGroundInk: THREE.LineSegments | null = null;
  if (buildingEdges?.geometry) {
    farBuildingInk = new THREE.LineSegments(
      buildingEdges.geometry,
      new THREE.LineBasicMaterial({
        color: getColour("--outline-building"),
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    farBuildingInk.name = "SectionKnifeFarInk";
    farBuildingInk.position.copy(buildingEdges.position);
    farBuildingInk.rotation.copy(buildingEdges.rotation);
    farBuildingInk.scale.copy(buildingEdges.scale);
    farBuildingInk.renderOrder = 800;
    city.add(farBuildingInk);
  }
  if (groundEdge?.geometry) {
    farGroundInk = new THREE.LineSegments(
      groundEdge.geometry,
      new THREE.LineBasicMaterial({
        color: getColour("--ground-edge"),
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    farGroundInk.name = "SectionKnifeFarGroundInk";
    farGroundInk.position.copy(groundEdge.position);
    farGroundInk.renderOrder = 790;
    city.add(farGroundInk);
  }

  const groundY = model.terrain ? model.terrain.min : 0;
  let topY = groundY + 30;
  for (const building of model.buildings) topY = Math.max(topY, groundY + building.height);

  function lineClipAudit(): boolean {
    const lineNames = new Set(["Contours3d", "Site::Boundary", "RailLines", "TramLines", "RoofLines"]);
    for (const mesh of clipTargets) {
      if (!lineNames.has(mesh.name) || !mesh.visible) continue;
      for (const material of meshMaterials(mesh)) {
        if (!material.clippingPlanes || material.clippingPlanes.length !== 1) return false;
      }
    }
    const contourMesh = clipTargets.find((mesh) => mesh.name === "Contours3d");
    if (contourMesh?.visible) {
      for (const material of meshMaterials(contourMesh)) {
        if (!material.clippingPlanes || material.clippingPlanes.length !== 1) return false;
      }
    }
    return true;
  }

  function apply(active: boolean, pose: SectionKnifePose) {
    const keep = knifePlane(pose);
    const far = knifePlaneInverted(pose);
    pocheGroup.visible = active;
    cutGroup.visible = active;
    cutGlow.visible = active;
    floorGroup.visible = active;
    frameLine.visible = active;
    if (farBuildingInk) farBuildingInk.visible = active;
    if (farGroundInk) farGroundInk.visible = active;

    if (active) {
      if (buildingEdges && buildingEdges.userData.sectionKnifeRestVisible === undefined) {
        buildingEdges.userData.sectionKnifeRestVisible = buildingEdges.visible;
      }
      if (groundEdge && groundEdge.userData.sectionKnifeRestVisible === undefined) {
        groundEdge.userData.sectionKnifeRestVisible = groundEdge.visible;
      }
      if (buildingEdges) buildingEdges.visible = false;
      if (groundEdge) groundEdge.visible = false;

      const profiles = collectSectionProfiles(model, pose);
      const axis = {
        originX: keep.normal.x * pose.offsetM,
        originZ: keep.normal.z * pose.offsetM,
        tangent: { x: -keep.normal.z, z: keep.normal.x },
      };
      rebuildPocheMeshes(profiles, axis, pocheGroup, pocheMat);
      rebuildCutLines(
        profiles,
        axis,
        cutGroup,
        cutGlow,
        floorGroup,
        getColour("--section-knife-cut-edge"),
        getColour("--section-knife-floor-line"),
      );
      rebuildPlaneFrame(pose, model, groundY, topY, frameLine);

      if (farBuildingInk) {
        const mat = farBuildingInk.material as THREE.LineBasicMaterial;
        mat.clippingPlanes = [far];
        mat.needsUpdate = true;
      }
      if (farGroundInk) {
        const mat = farGroundInk.material as THREE.LineBasicMaterial;
        mat.clippingPlanes = [far];
        mat.needsUpdate = true;
      }
    } else {
      if (buildingEdges && buildingEdges.userData.sectionKnifeRestVisible !== undefined) {
        buildingEdges.visible = buildingEdges.userData.sectionKnifeRestVisible;
      }
      if (groundEdge && groundEdge.userData.sectionKnifeRestVisible !== undefined) {
        groundEdge.visible = groundEdge.userData.sectionKnifeRestVisible;
      }
    }

    for (const mesh of clipTargets) {
      if (mesh.name === "Contours3d") {
        applyContourGeometryClip(mesh as unknown as THREE.LineSegments, keep, active);
      }
      for (const material of meshMaterials(mesh)) {
        if (active) {
          material.clippingPlanes = [keep];
          material.clipShadows = true;
        } else {
          const rest = matRest.get(material);
          material.clippingPlanes = rest?.clippingPlanes ?? null;
          material.clipShadows = rest?.clipShadows ?? false;
        }
        material.needsUpdate = true;
      }
    }
    pocheMat.clippingPlanes = active ? [keep] : null;
    pocheMat.needsUpdate = true;
    const contourPresent = Boolean(city.getObjectByName("Contours3d"));
    const contourTarget = clipTargets.find((target) => target.name === "Contours3d");
    let contourClipped = !contourPresent || !active;
    if (active && contourPresent) {
      if (!contourTarget?.visible) {
        contourClipped = true;
      } else {
        const rest = contourRestPositions.get(contourTarget as THREE.LineSegments);
        const posAttr = (contourTarget as THREE.LineSegments).geometry.getAttribute("position");
        const restVerts = rest ? rest.length / 3 : 0;
        const clipVerts = posAttr ? (posAttr.array as Float32Array).length / 3 : 0;
        let matsOk = true;
        for (const material of meshMaterials(contourTarget)) {
          if (!material.clippingPlanes || material.clippingPlanes.length !== 1) matsOk = false;
        }
        contourClipped = matsOk && restVerts > 6 && clipVerts > 0 && clipVerts < restVerts * 0.92;
      }
    }
    return { lineClipOk: active ? lineClipAudit() : true, contourPresent, contourClipped };
  }

  function dispose() {
    pocheGroup.removeFromParent();
    cutGroup.removeFromParent();
    cutGlow.removeFromParent();
    floorGroup.removeFromParent();
    frameLine.removeFromParent();
    farBuildingInk?.removeFromParent();
    farGroundInk?.removeFromParent();
    for (const mesh of clipTargets) {
      const rest = meshRest.get(mesh);
      if (rest) mesh.material = rest.material;
    }
    pocheGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
    });
    (cutGroup.geometry as THREE.BufferGeometry).dispose();
    (cutGlow.geometry as THREE.BufferGeometry).dispose();
    (floorGroup.geometry as THREE.BufferGeometry).dispose();
    (frameLine.geometry as THREE.BufferGeometry).dispose();
  }

  return { apply, dispose };
}
