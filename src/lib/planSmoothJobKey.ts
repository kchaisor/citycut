import type { ColourKey } from "./colours";
import { planModelCutToken } from "./planCutToken";
import type { PlanPathsRequest } from "./smoothPlanCompute";

export type SmoothPlanConsumer = "display" | "export";

function mixCutHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

function hashString(hash: number, text: string): number {
  let h = hash;
  for (let i = 0; i < text.length; i++) h = mixCutHash(h, text.charCodeAt(i));
  return h;
}

function hashColourSnapshot(snapshot: Partial<Record<ColourKey, string>> | undefined): string {
  if (!snapshot) return "0";
  const keys = Object.keys(snapshot).sort();
  let h = 2166136261;
  for (const key of keys) {
    h = hashString(h, key);
    h = hashString(h, snapshot[key as ColourKey] ?? "");
  }
  return h.toString(16);
}

/** Smooth plan identity for reuse and stale checks (includes plan scale and contour inputs). */
export function planSmoothGeometryKey(request: PlanPathsRequest): string {
  const cut = planModelCutToken(request.model);
  const opts = request.planOptions ?? {};
  const colour = request.colourSnapshot;
  const stylePart = [
    request.planScale ?? "",
    request.pathWidthM ?? "",
    request.contourIndexEvery ?? "",
    request.coarseIntervalM ?? "",
    request.coarseFromScale ?? "",
    opts.pathFilletM ?? "",
    opts.highlightManual ? "1" : "0",
    opts.centrelineSmooth === false ? "0" : "1",
    opts.buildingColour?.colourByUse ? "1" : "0",
    opts.buildingColour?.uniformBuildings ? "1" : "0",
    opts.buildingColour?.colourBySource ? "1" : "0",
  ].join("|");
  return `${cut}:${stylePart}:${hashColourSnapshot(colour)}`;
}

/** Per-consumer job identity; supersede only within the same consumer. */
export function planSmoothJobKey(request: PlanPathsRequest, consumer: SmoothPlanConsumer): string {
  return `${consumer}:${planSmoothGeometryKey(request)}`;
}
