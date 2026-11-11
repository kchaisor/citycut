import { openRing } from "./geo";
import { footprintBase } from "./terrain";
import { buildFacadeWallOverlayMesh, facadeOverlayPoints } from "./facadeSolarAssess";
import { planToWorld, worldOutward3, type FacadeAssessBundle } from "./facadeSolarTypes";
import type { BuildingFeat, CityModel } from "../types";

const BUILDING_SURFACE_LIFT_M = 0.05;

export type ProposedMassingBbox = {
  buildingId: number;
  east0: number;
  east1: number;
  north0: number;
  north1: number;
  height: number;
  baseYM: number;
};

export type FacadeObliqueCameraPose = {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

export type FacadeOverlayWallQa = {
  bboxes: ProposedMassingBbox[];
  targetInsideMassing: boolean;
  verticesOnWalls: boolean;
  wallHeightSpanOk: boolean;
  northSouthHourSpread: number;
  facadeOverlayCells: number;
};

function ringPlanBounds(ring: BuildingFeat["ring"]) {
  const open = openRing(ring);
  let east0 = Infinity;
  let east1 = -Infinity;
  let north0 = Infinity;
  let north1 = -Infinity;
  for (const [e, n] of open) {
    east0 = Math.min(east0, e);
    east1 = Math.max(east1, e);
    north0 = Math.min(north0, n);
    north1 = Math.max(north1, n);
  }
  return { east0, east1, north0, north1 };
}

function footprintBaseY(model: CityModel, building: BuildingFeat): number {
  return (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + BUILDING_SURFACE_LIFT_M;
}

export function primaryProposedMassingBbox(bboxes: readonly ProposedMassingBbox[]): ProposedMassingBbox | undefined {
  if (bboxes.length === 0) return undefined;
  return bboxes.reduce((pick, box) => (box.buildingId > pick.buildingId ? box : pick));
}

export function proposedMassingBboxes(model: CityModel): ProposedMassingBbox[] {
  const out: ProposedMassingBbox[] = [];
  for (const building of model.buildings) {
    if (!building.proposedMassing) continue;
    const { east0, east1, north0, north1 } = ringPlanBounds(building.ring);
    if (!Number.isFinite(east0)) continue;
    out.push({
      buildingId: building.id,
      east0,
      east1,
      north0,
      north1,
      height: building.height,
      baseYM: footprintBaseY(model, building),
    });
  }
  return out;
}

function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function buildingIdFromOverlayId(id: string): number | null {
  const match = /^facade-(-?\d+)-/.exec(id);
  return match ? Number(match[1]) : null;
}

function distanceToBuildingOutline(east: number, north: number, ring: BuildingFeat["ring"]): number {
  const open = openRing(ring);
  if (open.length < 2) return Infinity;
  const closed = [...open, open[0]!];
  let min = Infinity;
  for (let i = 0; i < closed.length - 1; i++) {
    const [ax, ay] = closed[i]!;
    const [bx, by] = closed[i + 1]!;
    min = Math.min(min, pointToSegmentDist(east, north, ax, ay, bx, by));
  }
  return min;
}

export function pointInsideProposedMassing(
  east: number,
  north: number,
  bboxes: readonly ProposedMassingBbox[],
  padM = 1.5,
): boolean {
  return bboxes.some(
    (box) =>
      east >= box.east0 - padM &&
      east <= box.east1 + padM &&
      north >= box.north0 - padM &&
      north <= box.north1 + padM,
  );
}

export function proposedMassingObliqueCamera(
  box: ProposedMassingBbox,
  side: "nw" | "se",
  elevationDeg = 40,
): FacadeObliqueCameraPose {
  const cx = (box.east0 + box.east1) * 0.5;
  const cn = (box.north0 + box.north1) * 0.5;
  const spanM = Math.max(box.east1 - box.east0, box.north1 - box.north0, box.height, 8);
  const range = spanM * 2.15;
  const elev = (elevationDeg * Math.PI) / 180;
  const horiz = range * Math.cos(elev);
  const vert = range * Math.sin(elev);
  const yMid = box.baseYM + box.height * 0.45;
  const zc = -cn;
  const sign = side === "nw" ? 1 : -1;
  return {
    eye: {
      x: cx + sign * horiz * 0.58,
      y: yMid + vert,
      z: zc - sign * horiz * 0.58,
    },
    target: { x: cx, y: yMid, z: zc },
  };
}

export function facadeOverlayWallQa(
  bundle: FacadeAssessBundle,
  model: CityModel,
  cameraTarget?: { x: number; y: number; z: number },
): FacadeOverlayWallQa {
  const bboxes = proposedMassingBboxes(model);
  const proposed = model.buildings.filter((building) => building.proposedMassing);
  const buildingsById = new Map(proposed.map((building) => [building.id, building]));
  const overlay = facadeOverlayPoints(bundle);
  const facadeBays = overlay.filter((point) => point.kind === "facade-bay");
  const { positions } = buildFacadeWallOverlayMesh(bundle);
  const vertsPerCell = 6;
  let verticesOnWalls = facadeBays.length > 0 && positions.length === facadeBays.length * vertsPerCell * 3;
  let wallHeightSpanOk = verticesOnWalls;
  for (const point of facadeBays) {
    const buildingId = buildingIdFromOverlayId(point.id);
    const building = buildingId != null ? buildingsById.get(buildingId) : undefined;
    if (!building) {
      verticesOnWalls = false;
      wallHeightSpanOk = false;
      continue;
    }
    const edgeDist = distanceToBuildingOutline(point.east, point.north, building.ring);
    if (edgeDist > 0.5) verticesOnWalls = false;
    const baseYM = footprintBaseY(model, building);
    if (point.yM < baseYM + 0.3 || point.yM > baseYM + building.height + 0.5) wallHeightSpanOk = false;
  }
  for (let cell = 0; cell < facadeBays.length && verticesOnWalls; cell++) {
    const point = facadeBays[cell]!;
    const buildingId = buildingIdFromOverlayId(point.id);
    const building = buildingId != null ? buildingsById.get(buildingId) : undefined;
    if (!building) {
      verticesOnWalls = false;
      break;
    }
    const [nx, , nz] = worldOutward3(point.outwardEast, point.outwardNorth);
    const [cx, , cz] = planToWorld(point.east, point.north, point.yM);
    const baseYM = footprintBaseY(model, building);
    for (let v = 0; v < vertsPerCell; v++) {
      const i = (cell * vertsPerCell + v) * 3;
      const vx = positions[i]!;
      const vy = positions[i + 1]!;
      const vz = positions[i + 2]!;
      const planeDist = Math.abs((vx - cx) * nx + (vz - cz) * nz);
      if (planeDist > 0.35) verticesOnWalls = false;
      if (vy < baseYM - 0.2 || vy > baseYM + building.height + 0.65) wallHeightSpanOk = false;
    }
  }
  const facadeUnits = bundle.facade?.units ?? [];
  const northHours = facadeUnits.filter((unit) => unit.outwardNorth > 0.55).map((unit) => unit.hoursDirect);
  const southHours = facadeUnits.filter((unit) => unit.outwardNorth < -0.55).map((unit) => unit.hoursDirect);
  const northAvg = northHours.length ? northHours.reduce((a, b) => a + b, 0) / northHours.length : 0;
  const southAvg = southHours.length ? southHours.reduce((a, b) => a + b, 0) / southHours.length : 0;
  const northSouthHourSpread = Math.abs(northAvg - southAvg);
  let targetInsideMassing = true;
  if (cameraTarget) {
    const east = cameraTarget.x;
    const north = -cameraTarget.z;
    targetInsideMassing = pointInsideProposedMassing(east, north, bboxes, 3);
  }
  return {
    bboxes,
    targetInsideMassing,
    verticesOnWalls,
    wallHeightSpanOk,
    northSouthHourSpread,
    facadeOverlayCells: facadeBays.length,
  };
}
