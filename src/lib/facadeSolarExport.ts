import { getColour } from "./colours";
import { facadeHoursFill } from "./facadeSolarAssess";
import type { FacadeAssessBundle } from "./facadeSolarTypes";

export function facadeSolarSvgTable(bundle: FacadeAssessBundle | null): string {
  const summary = bundle?.facade;
  if (!summary) return "";
  const rows = summary.units
    .slice(0, 120)
    .map(
      (unit) =>
        `<tr data-facade-unit="${unit.id}"><td>${unit.id}</td><td>${unit.floor + 1}</td><td>${unit.hoursDirect.toFixed(1)} h</td><td>${unit.meetsThreshold ? "meet" : unit.none ? "none" : "low"}</td></tr>`,
    )
    .join("");
  return `<g inkscape:label="Facade hours (ADG 4A-1 proxy)" data-facade-export-table><text y="0">Units ${summary.unitCount} · ≥${summary.thresholdHours}h ${summary.pctAtThreshold.toFixed(1)}% · none ${summary.pctNone.toFixed(1)}%</text><table>${rows}</table></g>`;
}

export type FacadePointExport = {
  east: number;
  north: number;
  yM: number;
  hours: number;
  colourKey: ReturnType<typeof facadeHoursFill>;
};

export function facadeSolarPointsForExport(bundle: FacadeAssessBundle | null): FacadePointExport[] {
  const summary = bundle?.facade;
  if (!summary) return [];
  return summary.units.map((unit) => ({
    east: unit.east,
    north: unit.north,
    yM: unit.yM,
    hours: unit.hoursDirect,
    colourKey: facadeHoursFill(unit.hoursDirect, summary.thresholdHours),
  }));
}

export function facadePointExportColour(key: FacadePointExport["colourKey"]): string {
  return getColour(key);
}
