import * as THREE from "three";
import { getColour } from "./colours";
import { groundHeightAt } from "./viewshed";
import {
  WALK_RIPPLE_AMENITY_COLOUR_TOKEN,
  WALK_RIPPLE_AMENITY_TYPES,
  type WalkRippleAmenityType,
} from "./walkRippleAmenityTypes";
import type { AmenityArrival } from "./walkRippleAmenityReach";
import type { CityModel } from "../types";

const RENDER_ORDER = 945;
const COLUMN_RADIUS_M = 1.1;
const COLUMN_HEIGHT_M = 22;
const POP_RISE_M = 0.8;

type BeaconMesh = THREE.InstancedMesh & {
  userData: {
    amenityType: WalkRippleAmenityType;
    amenityIds: number[];
    noScenePick?: boolean;
  };
};

function beaconMaterial(colourHex: string): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: colourHex,
    transparent: true,
    opacity: 0.82,
    toneMapped: false,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRippleTime = { value: -1 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aArrival;\nuniform float uRippleTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float pop = smoothstep(aArrival - 0.06, aArrival + 0.18, uRippleTime);
transformed.y *= pop;
transformed.y += ${POP_RISE_M.toFixed(2)} * pop;`,
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `walk-ripple-amenity-beacon-${colourHex}`;
  return material;
}

function setMaterialRippleTime(mesh: BeaconMesh, minutes: number): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    const shader = (item as THREE.MeshBasicMaterial).userData.shader as { uniforms: { uRippleTime: { value: number } } } | undefined;
    if (shader) shader.uniforms.uRippleTime.value = minutes;
  }
}

export class WalkRippleAmenityBeaconLayer {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<WalkRippleAmenityType, BeaconMesh>();
  private rippleMinutes = -1;
  private arrivals: AmenityArrival[] = [];
  private typeVisible: Record<WalkRippleAmenityType, boolean> = {
    cafe: true,
    school: true,
    park: true,
    transport: true,
  };

  constructor(private readonly model: Pick<CityModel, "terrain" | "sideM">) {
    this.root.name = "WalkRippleAmenityBeacons";
  }

  private z(east: number, north: number): number {
    return groundHeightAt(this.model, east, north);
  }

  clear(): void {
    for (const mesh of this.meshes.values()) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    this.arrivals = [];
    this.rippleMinutes = -1;
  }

  setTypeVisible(type: WalkRippleAmenityType, visible: boolean): void {
    this.typeVisible[type] = visible;
    const mesh = this.meshes.get(type);
    if (mesh) mesh.visible = visible;
  }

  setArrivals(arrivals: AmenityArrival[]): void {
    this.clear();
    this.arrivals = arrivals;
    const byType: Record<WalkRippleAmenityType, AmenityArrival[]> = {
      cafe: [],
      school: [],
      park: [],
      transport: [],
    };
    for (const amenity of arrivals) byType[amenity.type].push(amenity);
    const matrix = new THREE.Matrix4();
    for (const type of WALK_RIPPLE_AMENITY_TYPES) {
      const list = byType[type];
      if (list.length === 0) continue;
      const geometry = new THREE.CylinderGeometry(COLUMN_RADIUS_M, COLUMN_RADIUS_M * 0.85, COLUMN_HEIGHT_M, 8, 1, true);
      geometry.translate(0, COLUMN_HEIGHT_M * 0.5, 0);
      const material = beaconMaterial(getColour(WALK_RIPPLE_AMENITY_COLOUR_TOKEN[type]));
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.name = `WalkRippleAmenityBeacon-${type}`;
      mesh.userData.amenityType = type;
      mesh.userData.amenityIds = list.map((a) => a.id);
      mesh.userData.noScenePick = false;
      const beacon = mesh as unknown as BeaconMesh;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER;
      const arrivalsAttr = new Float32Array(list.length);
      list.forEach((amenity, index) => {
        arrivalsAttr[index] = amenity.arrivalMin;
        mesh.setMatrixAt(index, matrix.makeTranslation(amenity.east, this.z(amenity.east, amenity.north), -amenity.north));
      });
      mesh.geometry.setAttribute("aArrival", new THREE.InstancedBufferAttribute(arrivalsAttr, 1));
      mesh.instanceMatrix.needsUpdate = true;
      beacon.visible = this.typeVisible[type];
      this.meshes.set(type, beacon);
      this.root.add(beacon);
    }
    this.setRippleTimeMinutes(this.rippleMinutes >= 0 ? this.rippleMinutes : 0);
  }

  setRippleTimeMinutes(minutes: number): void {
    this.rippleMinutes = minutes;
    for (const mesh of this.meshes.values()) setMaterialRippleTime(mesh, minutes);
  }

  beaconMeshes(): BeaconMesh[] {
    return [...this.meshes.values()];
  }

  amenityAt(type: WalkRippleAmenityType, instanceIndex: number): AmenityArrival | null {
    const mesh = this.meshes.get(type);
    if (!mesh) return null;
    const id = mesh.userData.amenityIds[instanceIndex];
    if (id == null) return null;
    return this.arrivals.find((a) => a.id === id) ?? null;
  }

  dispose(): void {
    this.clear();
  }
}
