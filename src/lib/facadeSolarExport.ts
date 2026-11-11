import { getColour } from "./colours";
import { facadeBayUnitsForModel } from "./facadeSolarSample";
import { facadeHoursFill } from "./facadeSolarAssess";
import type { FacadeAssessBundle } from "./facadeSolarTypes";
import type { CityModel } from "../types";

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

export function facadeSolarPointsForExport(model: CityModel, bundle: FacadeAssessBundle | null): FacadePointExport[] {
  const summary = bundle?.facade;
  if (!summary) return [];
  const byId = new Map(summary.units.map((unit) => [unit.id, unit]));
  const threshold = summary.thresholdHours;
  return facadeBayUnitsForModel(model).flatMap((sample) => {
    const unit = byId.get(sample.id);
    if (!unit) return [];
    return [
      {
        east: sample.east,
        north: sample.north,
        yM: sample.yM,
        hours: unit.hoursDirect,
        colourKey: facadeHoursFill(unit.hoursDirect, threshold),
      },
    ];
  });
}

export function facadePointExportColour(key: FacadePointExport["colourKey"]): string {
  return getColour(key);
}
