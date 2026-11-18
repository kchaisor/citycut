import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getColour } from "../../lib/colours";
import { facadeOverlayCellNormals } from "../../lib/facadeSolarAssess";
import {
  facadeOverlayWallQa,
  primaryProposedMassingBbox,
  proposedMassingBboxes,
  proposedMassingObliqueCamera,
} from "../../lib/facadeSolarQa";
import type { PlanViewport } from "../../lib/planViewport";
import { ringFromCorners } from "../../lib/solarAccessB43";
import { largestGreenAreaBounds } from "../../lib/solarGreenPick";
import type { SolarAssessRow, SolarReceptorArea } from "../../lib/solarReceptorAssess";
import { nextParkReceptorId, nextReceptorId, normalizeReceptorRing } from "../../lib/solarReceptorStore";
import { defaultParkRuleId, solarRuleDefinition, type ParkSolarRuleId } from "../../lib/solarRuleRegistry";
import { sunHoursGroundPaletteEndpointKeys } from "../../lib/sunHoursGround";
import { countSunHoursGroundCells, footprintMaskedCells } from "../../lib/sunHoursGroundPlan";
import { countPositiveLossCells, positiveLossCellsInsideFootprints } from "../../lib/sunHoursLostPlan";
import type { BuildingFeat, CityModel } from "../../types";
import type { SolarViewSettings } from "../SolarHeliodon";
import type { useFacadeSolarAssess } from "../useFacadeSolarAssess";
import type { useSunHoursGround } from "../useSunHoursGround";
import type { useSunHoursLostPlan } from "../useSunHoursLostPlan";

export type ModelPageSolarQaDeps = {
  setQaProposedMassing: Dispatch<SetStateAction<BuildingFeat[]>>;
  setPlanViewport: Dispatch<SetStateAction<PlanViewport>>;
  setSolar: Dispatch<SetStateAction<SolarViewSettings>>;
  setSolarReceptors: Dispatch<SetStateAction<SolarReceptorArea[]>>;
  solarRef: MutableRefObject<SolarViewSettings>;
  solarReceptorsRef: MutableRefObject<SolarReceptorArea[]>;
  solarReceptorAssessRef: MutableRefObject<{ results: SolarAssessRow[]; pending: boolean }>;
  facadeSolarAssessRef: MutableRefObject<ReturnType<typeof useFacadeSolarAssess>>;
  facadeMassingModelRef: MutableRefObject<CityModel>;
  drawingModelRef: MutableRefObject<CityModel>;
  sunHoursLostPlanRef: MutableRefObject<ReturnType<typeof useSunHoursLostPlan>>;
  sunHoursGroundRef: MutableRefObject<ReturnType<typeof useSunHoursGround>>;
};

export function modelPageSolarQa({
  setQaProposedMassing,
  setPlanViewport,
  setSolar,
  setSolarReceptors,
  solarRef,
  solarReceptorsRef,
  solarReceptorAssessRef,
  facadeSolarAssessRef,
  facadeMassingModelRef,
  drawingModelRef,
  sunHoursLostPlanRef,
  sunHoursGroundRef,
}: ModelPageSolarQaDeps) {
  return {
    setQaProposedMassingBox(east = 0, north = 0, size = 30, height = 18) {
      const half = size / 2;
      setQaProposedMassing([
        {
          id: -910001,
          ring: [
            [east - half, north - half],
            [east + half, north - half],
            [east + half, north + half],
            [east - half, north + half],
            [east - half, north - half],
          ],
          holes: [],
          height,
          use: "unclassified",
          source: "none",
          proposedMassing: true,
          overtureName: "QA proposed massing",
        },
      ]);
      return true;
    },
    clearQaProposedMassing() {
      setQaProposedMassing([]);
    },
    setDrawingPlanViewport(east: number, north: number, spanM: number) {
      const aspect = 1.05;
      setPlanViewport({
        x: east - spanM / 2,
        y: -north - (spanM * aspect) / 2,
        w: spanM,
        h: spanM * aspect,
      });
      return true;
    },
    setSolarPlanMinimal() {
      setSolar((prev) => ({
        ...prev,
        solarAccess: false,
        sunHoursLost: false,
        sunHours: false,
        sunStudy: false,
        castShadows: true,
        receptorDraw: false,
      }));
      return true;
    },
    setSolarStudiesFull() {
      setSolar((prev) => ({
        ...prev,
        solarAccess: true,
        sunHoursLost: true,
        sunStudy: true,
        month: 9,
        day: 22,
        castShadows: true,
        receptorDraw: true,
      }));
      return true;
    },
    enableSolarAccess() {
      setSolar((prev) => ({
        ...prev,
        solarAccess: true,
        sunStudy: true,
        month: 9,
        day: 22,
        castShadows: true,
        receptorDraw: true,
      }));
      return true;
    },
    addSolarReceptor(east0: number, north0: number, east1: number, north1: number, id?: string) {
      const ring = ringFromCorners([east0, north0], [east1, north1]);
      const normalized = normalizeReceptorRing(ring);
      if (!normalized) return null;
      const receptorId = id ?? nextReceptorId(solarReceptorsRef.current);
      setSolarReceptors((current) => [...current, { id: receptorId, ring: normalized, kind: "yard" }]);
      return receptorId;
    },
    enableSolarParkAccess(ruleId?: string) {
      const resolved = (ruleId ?? solarRef.current.parkRuleId ?? defaultParkRuleId()) as ParkSolarRuleId;
      const rule = solarRuleDefinition(resolved);
      setSolar((prev) => ({
        ...prev,
        solarParkAccess: true,
        parkRuleId: resolved,
        month: rule.month,
        day: rule.day,
        castShadows: true,
        parkReceptorDraw: true,
      }));
      return true;
    },
    readLargestGreenAreaBounds() {
      return largestGreenAreaBounds(drawingModelRef.current);
    },
    setSolarPlanTime(hour: number, minute = 0) {
      setSolar((prev) => ({ ...prev, hour, minute, castShadows: true, sunStudy: false }));
      return true;
    },
    addSolarParkFromLargestGreen(id?: string, ruleId?: string) {
      const bounds = largestGreenAreaBounds(drawingModelRef.current);
      if (!bounds) return null;
      const inset = 4;
      const east0 = bounds.east0 + inset;
      const north0 = bounds.north0 + inset;
      const east1 = bounds.east1 - inset;
      const north1 = bounds.north1 - inset;
      if (east1 - east0 < 8 || north1 - north0 < 8) return null;
      const ring = ringFromCorners([east0, north0], [east1, north1]);
      const normalized = normalizeReceptorRing(ring);
      if (!normalized) return null;
      const receptorId = id ?? nextParkReceptorId(solarReceptorsRef.current);
      const resolvedRule = (ruleId ?? solarRef.current.parkRuleId ?? defaultParkRuleId()) as ParkSolarRuleId;
      setSolarReceptors((current) => [
        ...current,
        { id: receptorId, ring: normalized, kind: "park", ruleId: resolvedRule },
      ]);
      return receptorId;
    },
    addSolarParkReceptor(east0: number, north0: number, east1: number, north1: number, id?: string, ruleId?: string) {
      const ring = ringFromCorners([east0, north0], [east1, north1]);
      const normalized = normalizeReceptorRing(ring);
      if (!normalized) return null;
      const receptorId = id ?? nextParkReceptorId(solarReceptorsRef.current);
      const resolvedRule = (ruleId ?? solarRef.current.parkRuleId ?? defaultParkRuleId()) as ParkSolarRuleId;
      setSolarReceptors((current) => [
        ...current,
        { id: receptorId, ring: normalized, kind: "park", ruleId: resolvedRule },
      ]);
      return receptorId;
    },
    clearSolarReceptors() {
      setSolarReceptors([]);
    },
    readSolarReceptorAssess() {
      return solarReceptorAssessRef.current.results;
    },
    enableFacadeSolar() {
      setSolar((prev) => ({
        ...prev,
        facadeSolarAccess: true,
        month: 6,
        day: 21,
        hour: 12,
        castShadows: true,
      }));
      return true;
    },
    readFacadeSolarAssess() {
      return facadeSolarAssessRef.current.bundle;
    },
    readFacadeOverlayNormals() {
      const bundle = facadeSolarAssessRef.current.bundle;
      return bundle ? facadeOverlayCellNormals(bundle) : [];
    },
    frameProposedMassingOblique(side: "nw" | "se") {
      const box = primaryProposedMassingBbox(proposedMassingBboxes(facadeMassingModelRef.current));
      if (!box || !window.__citycutQa?.setCamera) return false;
      window.__citycutQa.setCamera(proposedMassingObliqueCamera(box, side));
      return true;
    },
    readFacadeOverlayWallQa() {
      const bundle = facadeSolarAssessRef.current.bundle;
      if (!bundle) return null;
      const target = window.__citycutQa?.getCamera?.()?.target;
      return facadeOverlayWallQa(bundle, facadeMassingModelRef.current, target ?? undefined);
    },
    enableSunHoursLost() {
      setSolar((prev) => ({
        ...prev,
        sunHoursLost: true,
        sunStudy: true,
        month: 9,
        day: 22,
        castShadows: true,
      }));
      return true;
    },
    enableTreeShadows() {
      setSolar((prev) => ({ ...prev, treesCastShadow: true, castShadows: true }));
      return true;
    },
    setTreesCastShadow(on: boolean) {
      setSolar((prev) => ({ ...prev, treesCastShadow: on, castShadows: true }));
      return true;
    },
    readSunHoursLostPlan() {
      const { grid } = sunHoursLostPlanRef.current;
      if (!grid) return { cellCount: 0, maxLoss: 0, southLossCells: 0, footprintInside: 0 };
      const footprintInside = positiveLossCellsInsideFootprints(drawingModelRef.current, grid).length;
      return {
        cellCount: countPositiveLossCells(grid),
        maxLoss: grid.maxLoss,
        cellM: grid.cellM,
        footprintInside,
      };
    },
    enableSunHoursGround() {
      setSolar((prev) => ({
        ...prev,
        sunHours: true,
        month: 6,
        day: 21,
        castShadows: true,
      }));
      return true;
    },
    readSunHoursTerrainRelief() {
      const cut = drawingModelRef.current;
      if (!cut.terrain) return { relief: 0, min: 0, max: 0 };
      return { relief: cut.terrain.max - cut.terrain.min, min: cut.terrain.min, max: cut.terrain.max };
    },
    readSunHoursGround() {
      const { grid, overlay, scaleMaxHours } = sunHoursGroundRef.current;
      const endpoints = sunHoursGroundPaletteEndpointKeys();
      return {
        enabled: Boolean(solarRef.current.sunHours),
        month: solarRef.current.month,
        day: solarRef.current.day,
        cellM: grid?.cellM ?? 0,
        cellCount: grid ? countSunHoursGroundCells(grid) : 0,
        maskedFootprints: grid ? footprintMaskedCells(grid) : 0,
        maxSunHours: scaleMaxHours || grid?.maxSunHours || 0,
        surfaceCells: overlay?.cellCount ?? 0,
        paletteMin: getColour(endpoints.minKey),
        paletteMax: getColour(endpoints.maxKey),
      };
    },
    frameSunHoursGroundPlan() {
      if (!window.__citycutQa?.setCamera) return false;
      const cut = drawingModelRef.current;
      const side = cut.sideM;
      const lift = cut.terrain ? (cut.terrain.min + cut.terrain.max) / 2 : 0;
      const groundY = cut.terrain ? cut.terrain.min : 0;
      const altitude = Math.max(side * 0.9, 120);
      window.__citycutQa.setCamera({
        eye: { x: 0, y: groundY + altitude, z: 0 },
        target: { x: 0, y: lift, z: 0 },
      });
      return true;
    },
    frameSunHoursGroundOblique() {
      if (!window.__citycutQa?.setCamera) return false;
      const cut = drawingModelRef.current;
      const side = cut.sideM;
      const groundY = cut.terrain ? cut.terrain.min : 0;
      const lift = cut.terrain ? (cut.terrain.min + cut.terrain.max) / 2 : 0;
      const span = side * 0.55;
      window.__citycutQa.setCamera({
        eye: { x: -span, y: groundY + span * 0.55, z: span * 0.75 },
        target: { x: 0, y: lift, z: 0 },
      });
      return true;
    },
    frameSunHoursTerrainEdge() {
      if (!window.__citycutQa?.setCamera) return false;
      const cut = drawingModelRef.current;
      const side = cut.sideM;
      const groundY = cut.terrain ? cut.terrain.min : 0;
      const relief = cut.terrain ? cut.terrain.max - cut.terrain.min : 0;
      const westEdge = -side * 0.5 + side * 0.06;
      const southEdge = -side * 0.42;
      const slopeY = groundY + relief * 0.35;
      const span = side * 0.34;
      window.__citycutQa.setCamera({
        eye: { x: westEdge - span * 0.95, y: slopeY + span * 0.62, z: southEdge + span * 0.45 },
        target: { x: westEdge + span * 0.18, y: slopeY + relief * 0.08, z: southEdge - span * 0.06 },
      });
      return true;
    },
  };
}
