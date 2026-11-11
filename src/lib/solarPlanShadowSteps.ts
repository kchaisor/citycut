import type { MultiPolygon } from "polygon-clipping";
import {
  isProposedMassingBuilding,
  planShadowSplitRings,
  type PlanShadowInput,
  type PlanShadowTreeMode,
} from "./buildingShadows";
import { pointInPolygon } from "./useCascade";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import { solarRuleAssessmentSteps, solarRuleDefinition, type SolarRuleDefinition } from "./solarRuleRegistry";
import { planShadowRingsToMulti } from "./solarReceptorAssess";
import type { BuildingFeat, CityModel, Ring } from "../types";

export type StepShadow = {
  hour: number;
  minute: number;
  existing: MultiPolygon;
  proposed: MultiPolygon;
  buildingShadow: MultiPolygon;
};

const SHADOW_CONTEXT_MARGIN_M = 160;

function ringBounds(ring: Ring, marginM: number) {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [east, north] of ring) {
    minE = Math.min(minE, east);
    maxE = Math.max(maxE, east);
    minN = Math.min(minN, north);
    maxN = Math.max(maxN, north);
  }
  return { minE: minE - marginM, maxE: maxE + marginM, minN: minN - marginM, maxN: maxN + marginM };
}

function buildingInBounds(building: BuildingFeat, bounds: ReturnType<typeof ringBounds>): boolean {
  for (const [east, north] of building.ring) {
    if (east >= bounds.minE && east <= bounds.maxE && north >= bounds.minN && north <= bounds.maxN) return true;
  }
  return false;
}

export function clipModelForRings(model: CityModel, rings: readonly Ring[]): CityModel {
  if (rings.length === 0) return model;
  const bounds = rings.reduce(
    (acc, ring) => {
      const next = ringBounds(ring, SHADOW_CONTEXT_MARGIN_M);
      return {
        minE: Math.min(acc.minE, next.minE),
        maxE: Math.max(acc.maxE, next.maxE),
        minN: Math.min(acc.minN, next.minN),
        maxN: Math.max(acc.maxN, next.maxN),
      };
    },
    { minE: Infinity, maxE: -Infinity, minN: Infinity, maxN: -Infinity },
  );
  const buildings = model.buildings.filter((building) => buildingInBounds(building, bounds));
  return buildings.length === model.buildings.length ? model : { ...model, buildings };
}

export function buildRescodeStepShadows(
  model: CityModel,
  year: number,
  clipRings: readonly Ring[] = [],
  treeMode: PlanShadowTreeMode = "off",
): StepShadow[] {
  return buildRuleStepShadows(model, year, solarRuleDefinition("rescode-b43"), clipRings, treeMode);
}

export function buildRuleStepShadows(
  model: CityModel,
  year: number,
  rule: SolarRuleDefinition,
  clipRings: readonly Ring[] = [],
  treeMode: PlanShadowTreeMode = "off",
): StepShadow[] {
  const contextBuildings = model.buildings.filter((building) => !isProposedMassingBuilding(building));
  const context = { ...model, buildings: contextBuildings };
  const clipped = clipRings.length > 0 ? clipModelForRings(model, clipRings) : model;
  const steps = solarRuleAssessmentSteps(model.center.lat, model.center.lon, year, rule);
  return steps.map((step) => {
    const when: PlanShadowInput = {
      lat: model.center.lat,
      lon: model.center.lon,
      year,
      month: rule.month,
      day: rule.day,
      hour: step.hour,
      minute: step.minute,
    };
    const existingSplit = planShadowSplitRings(context, when, true, treeMode);
    const proposedSplit = planShadowSplitRings(clipped, when, true, treeMode);
  const proposedRings = [...proposedSplit.existing, ...proposedSplit.added];
    const existing = planShadowRingsToMulti(existingSplit.existing);
    const proposed = planShadowRingsToMulti(proposedRings);
    return {
      hour: step.hour,
      minute: step.minute,
      existing,
      proposed,
      buildingShadow: proposed,
    };
  });
}

export function buildDaylightGroundStepShadows(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  stepMinutes = 15,
  treeMode: PlanShadowTreeMode = "off",
): StepShadow[] {
  const lat = model.center.lat;
  const lon = model.center.lon;
  const window = daylightWindowMinutes(lat, lon, year, month, day);
  if (!window) return [];
  const out: StepShadow[] = [];
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += stepMinutes) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const sample = sunAtMelbourneLocal(lat, lon, year, month, day, hour, minute);
    if (!sample.aboveHorizon) continue;
    const when: PlanShadowInput = { lat, lon, year, month, day, hour, minute };
    const split = planShadowSplitRings(model, when, true, treeMode);
    const allRings = [...split.existing, ...split.added];
    const buildingShadow = planShadowRingsToMulti(allRings);
    const empty: MultiPolygon = [];
    out.push({ hour, minute, existing: empty, proposed: buildingShadow, buildingShadow });
  }
  return out;
}

export function buildRescodeRuleStepShadows(
  model: CityModel,
  year: number,
  clipRings: readonly Ring[] = [],
  treeMode: PlanShadowTreeMode = "off",
): StepShadow[] {
  const rule = solarRuleDefinition("rescode-b43");
  return buildRuleStepShadows(model, year, rule, clipRings, treeMode);
}

export function gridPointsInRing(ring: Ring, stepM: number): [number, number][] {
  if (ring.length < 3 || !(stepM > 0)) return [];
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [east, north] of ring) {
    minE = Math.min(minE, east);
    maxE = Math.max(maxE, east);
    minN = Math.min(minN, north);
    maxN = Math.max(maxN, north);
  }
  const points: [number, number][] = [];
  for (let east = minE + stepM / 2; east < maxE; east += stepM) {
    for (let north = minN + stepM / 2; north < maxN; north += stepM) {
      if (pointInPolygon([east, north], ring, [])) points.push([east, north]);
    }
  }
  return points;
}
