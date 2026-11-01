import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { RefObject } from "react";
import { BUILDING_USE_META } from "../lib/buildingUse";
import {
  buildingFootprintAreaM2,
  buildingHudStats,
  buildingScreenFillRatio,
  lateralBuildingHeights,
  nearestRoadAt,
  projectWorldToScreen,
  buildingCentroid,
} from "../lib/semanticHudGeometry";
import {
  cameraPitchDegFromEyeTarget,
  resolveSemanticHudMode,
  type SemanticHudMode,
} from "../lib/semanticHudMode";
import type { SemanticHudLabel, SemanticHudSample } from "../lib/semanticHudSample";
import { effectiveBuildingHeightM } from "../lib/buildingHeightResolve";
import { buildingIdFromIntersection } from "../lib/buildingPick";
import type { BuildingFeat, RoadFeat } from "../types";

const EVAL_MIN_INTERVAL_MS = 100;
const scratchRay = new THREE.Raycaster();
const scratchPointer = new THREE.Vector2();
const scratchHit = new THREE.Vector3();

export function SemanticHudSampler({
  enabled,
  buildings,
  roads,
  groundY,
  cityRootRef,
  controlsRef,
  onSample,
}: {
  enabled: boolean;
  buildings: BuildingFeat[];
  roads: RoadFeat[];
  groundY: number;
  cityRootRef: RefObject<THREE.Object3D | null>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onSample: (sample: SemanticHudSample) => void;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const modeRef = useRef<SemanticHudMode>("overview");
  const lastEvalMs = useRef(0);

  useFrame((state) => {
    if (!enabled) return;
    const now = state.clock.elapsedTime * 1000;
    if (now - lastEvalMs.current < EVAL_MIN_INTERVAL_MS) return;
    lastEvalMs.current = now;
    const controls = controlsRef.current;
    const cityRoot = cityRootRef.current;
    if (!controls || !cityRoot) return;

    const eye: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const target: [number, number, number] = [controls.target.x, controls.target.y, controls.target.z];
    const eyeHeightM = Math.max(0, eye[1] - groundY);
    const pitchDeg = cameraPitchDegFromEyeTarget(eye, target);

    scratchPointer.set(0, 0);
    scratchRay.setFromCamera(scratchPointer, camera);
    const hits = scratchRay.intersectObject(cityRoot, true);
    let focusBuilding: BuildingFeat | null = null;
    let nearestBuildingDistanceM: number | null = null;
    for (const hit of hits) {
      const id = buildingIdFromIntersection(hit);
      if (id == null) continue;
      const building = buildings.find((row) => row.id === id) ?? null;
      if (!building) continue;
      focusBuilding = building;
      nearestBuildingDistanceM = hit.distance;
      break;
    }

    let buildingScreenFill = 0;
    if (focusBuilding) {
      buildingScreenFill = buildingScreenFillRatio(camera, size.width, size.height, focusBuilding, groundY);
    } else {
      let bestFill = 0;
      let bestDist: number | null = null;
      for (const building of buildings) {
        const fill = buildingScreenFillRatio(camera, size.width, size.height, building, groundY);
        if (fill > bestFill) {
          bestFill = fill;
          const c = buildingCentroid(building);
          scratchHit.set(c[0], groundY, -c[1]);
          bestDist = camera.position.distanceTo(scratchHit);
          if (fill >= 0.04) focusBuilding = building;
        }
      }
      buildingScreenFill = bestFill;
      if (nearestBuildingDistanceM == null) nearestBuildingDistanceM = bestDist;
    }

    const mode = resolveSemanticHudMode(modeRef.current, {
      eyeHeightM,
      pitchDeg,
      nearestBuildingDistanceM,
      buildingScreenFill,
    });
    modeRef.current = mode;

    let buildingReadout = null;
    if (mode === "building" && focusBuilding) {
      const stats = buildingHudStats(focusBuilding);
      buildingReadout = {
        building: focusBuilding,
        heightM: stats.heightM,
        heightSource: stats.heightSource,
        floors: stats.floors,
        floorsEstimated: stats.floorsEstimated,
        useLabel: BUILDING_USE_META[focusBuilding.use].label,
        footprintM2: stats.footprintM2,
        gfaM2: stats.gfaM2,
      };
    }

    let walkReadout = null;
    if (mode === "walk") {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
      const at = scratchHit;
      if (scratchRay.ray.intersectPlane(plane, at)) {
        const localAt: [number, number] = [at.x, -at.z];
        const roadHit = nearestRoadAt(roads, localAt);
        const lateral = roadHit
          ? lateralBuildingHeights(buildings, localAt, roadHit.tangent)
          : { leftM: null, rightM: null };
        walkReadout = {
          streetName: roadHit?.road.name ?? null,
          roadWidthM: roadHit?.road.width ?? null,
          leftHeightM: lateral.leftM,
          rightHeightM: lateral.rightM,
        };
      }
    }

    const labels = buildLabels({
      buildings,
      roads,
      camera,
      width: size.width,
      height: size.height,
      groundY,
      eyeHeightM,
      mode,
    });

    onSample({
      mode,
      eyeHeightM,
      pitchDeg,
      building: buildingReadout,
      walk: walkReadout,
      labels,
    });
  });

  return null;
}

function buildLabels({
  buildings,
  roads,
  camera,
  width,
  height,
  groundY,
  eyeHeightM,
  mode,
}: {
  buildings: BuildingFeat[];
  roads: RoadFeat[];
  camera: THREE.Camera;
  width: number;
  height: number;
  groundY: number;
  eyeHeightM: number;
  mode: SemanticHudMode;
}): SemanticHudLabel[] {
  const zoomBand =
    eyeHeightM <= 12 ? "close" : eyeHeightM <= 45 ? "mid" : eyeHeightM <= 120 ? "far" : "wide";
  const minBuildingArea = zoomBand === "close" ? 80 : zoomBand === "mid" ? 220 : zoomBand === "far" ? 600 : 1400;
  const showPaths = zoomBand === "close";
  const showUnnamedStreets = zoomBand !== "wide";
  const labels: SemanticHudLabel[] = [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [];

  for (const road of roads) {
    if (road.kind !== "road") continue;
    if (road.grade === "path" && !showPaths) continue;
    if (!road.name && !showUnnamedStreets) continue;
    if (road.grade === "local" && zoomBand === "wide" && !road.name) continue;
    if (road.grade === "local" && zoomBand === "far" && !road.name) continue;
    const mid = road.line[Math.floor(road.line.length / 2)] ?? road.line[0];
    if (!mid) continue;
    const projected = projectWorldToScreen(
      camera,
      width,
      height,
      scratchHit.set(mid[0], groundY + 0.4, -mid[1]),
    );
    if (!projected || projected.behind) continue;
    const text = road.name ?? (road.grade === "arterial" ? "Road" : null);
    if (!text) continue;
    const scale = zoomBand === "close" ? 1 : zoomBand === "mid" ? 0.92 : zoomBand === "far" ? 0.82 : 0.74;
    pushLabel(labels, boxes, {
      id: `road-${road.id}-${mid[0].toFixed(0)}`,
      text,
      x: projected.x,
      y: projected.y,
      scale,
      kind: "street",
    });
  }

  for (const building of buildings) {
    const area = building.ring.length;
    if (area < 3) continue;
    const footprint = buildingFootprintAreaM2(building);
    if (footprint < minBuildingArea) continue;
    const name = building.overtureName?.trim();
    if (!name && zoomBand !== "close") continue;
    if (!name && mode !== "building") continue;
    const c = buildingCentroid(building);
    const top = effectiveBuildingHeightM(building);
    const projected = projectWorldToScreen(
      camera,
      width,
      height,
      scratchHit.set(c[0], groundY + top * 0.55, -c[1]),
    );
    if (!projected || projected.behind) continue;
    const text = name ?? `${BUILDING_USE_META[building.use].label}`;
    const scale = zoomBand === "close" ? 1 : zoomBand === "mid" ? 0.9 : 0.8;
    pushLabel(labels, boxes, {
      id: `bldg-${building.id}`,
      text,
      x: projected.x,
      y: projected.y,
      scale,
      kind: "building",
    });
  }

  return labels.slice(0, zoomBand === "close" ? 28 : zoomBand === "mid" ? 18 : 10);
}

function pushLabel(
  labels: SemanticHudLabel[],
  boxes: { x: number; y: number; w: number; h: number }[],
  label: SemanticHudLabel,
) {
  const w = Math.max(36, label.text.length * 6.2) * label.scale;
  const h = 16 * label.scale;
  const box = { x: label.x - w / 2, y: label.y - h / 2, w, h };
  for (const other of boxes) {
    if (overlap(box, other)) return;
  }
  boxes.push(box);
  labels.push(label);
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
