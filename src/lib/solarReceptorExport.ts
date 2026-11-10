import type { ColourKey } from "./colours";
import type { SolarReceptorExport } from "./aiPlan";
import type { SolarReceptorArea, SolarReceptorAssessResult } from "./solarReceptorAssess";
import { receptorLayerName } from "./solarStudyLayers";

export function solarReceptorExportFill(tone: string): ColourKey {
  if (tone === "fail") return "--solar-receptor-fail";
  if (tone === "warn") return "--solar-receptor-warn";
  return "--solar-receptor-pass";
}

export function solarReceptorsForExport(
  receptors: readonly SolarReceptorArea[],
  results: readonly SolarReceptorAssessResult[],
): SolarReceptorExport[] {
  const byId = new Map(results.map((row) => [row.id, row]));
  return receptors.map((receptor) => ({
    id: receptor.id,
    ring: receptor.ring,
    statusTone: byId.get(receptor.id)?.statusTone ?? "pass",
  }));
}

export { receptorLayerName };
