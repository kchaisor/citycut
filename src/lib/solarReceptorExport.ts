import type { ColourKey } from "./colours";
import type { SolarReceptorExport } from "./aiPlan";
import { isParkAssessRow, type SolarAssessRow, type SolarReceptorArea } from "./solarReceptorAssess";
import { parkReceptorLayerName, receptorLayerName } from "./solarStudyLayers";

export function solarReceptorExportFill(tone: string): ColourKey {
  if (tone === "fail") return "--solar-receptor-fail";
  if (tone === "warn") return "--solar-receptor-warn";
  return "--solar-receptor-pass";
}

export function solarReceptorExportLayerName(receptor: SolarReceptorArea, row: SolarAssessRow | undefined): string {
  if (row && isParkAssessRow(row)) return parkReceptorLayerName(receptor.id, row.ruleLabel, row.statusTone);
  return receptorLayerName(receptor.id, row?.statusTone ?? "pass");
}

export function solarReceptorsForExport(
  receptors: readonly SolarReceptorArea[],
  results: readonly SolarAssessRow[],
): SolarReceptorExport[] {
  const byId = new Map(results.map((row) => [row.id, row]));
  return receptors.map((receptor) => ({
    id: receptor.id,
    ring: receptor.ring,
    statusTone: byId.get(receptor.id)?.statusTone ?? "pass",
    layerName: solarReceptorExportLayerName(receptor, byId.get(receptor.id)),
  }));
}

export { parkReceptorLayerName, receptorLayerName };
