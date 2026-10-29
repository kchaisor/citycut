import { readDrawingStyle, type LineStyles } from "./drawingStyle";
import { layoutSheet } from "./figureGround";
import { stableExportModel } from "./exportStableOrder";
import { openRing } from "./geo";
import { HEIGHT_RELIABILITY_EXPORT_LAYER, heightReliabilityClass } from "./buildingHeightReliability";
import { planPaths, type PlanPaths } from "./svgPlan";
import type { SitePlanExportOptions } from "./aiPlan";
import type { CityModel } from "../types";

function dxfEsc(text: string): string {
  return text.replace(/\\/g, "\\\\");
}

function sheetPoint(east: number, north: number, sideM: number, layout: ReturnType<typeof layoutSheet>): [number, number] {
  const frameMm = layout.frameMm;
  const x = layout.frameX + ((east + sideM / 2) / sideM) * frameMm;
  const y = layout.frameY + layout.frameMm - ((north + sideM / 2) / sideM) * frameMm;
  return [x, y];
}

function lwpolylineLayer(layer: string, points: [number, number][], closed: boolean): string {
  if (points.length < 2) return "";
  const flag = closed ? 1 : 0;
  const verts = points.flatMap(([x, y]) => [` 10\n${x}`, ` 20\n${y}`]).join("\n");
  return `  0\nLWPOLYLINE\n  8\n${dxfEsc(layer)}\n 90\n${points.length}\n 70\n${flag}\n${verts}\n`;
}

function buildingPolylines(
  plan: PlanPaths,
  model: CityModel,
  layout: ReturnType<typeof layoutSheet>,
  layerName: string,
  filter: (entry: PlanPaths["buildings"][number]) => boolean,
): string {
  const lines: string[] = [];
  for (const building of plan.buildings.filter(filter)) {
    for (const ring of building.rings) {
      const pts = openRing(ring).map(([e, n]) => sheetPoint(e, n, model.sideM, layout));
      if (pts.length >= 2) lines.push(lwpolylineLayer(layerName, pts, true));
    }
  }
  return lines.join("");
}

export function sitePlanDxf(
  model: CityModel,
  scale: number,
  style: LineStyles = readDrawingStyle(),
  exportOptions?: SitePlanExportOptions | null,
): string {
  model = stableExportModel(model);
  const colourByHeightReliability = Boolean(exportOptions?.colourByHeightReliability);
  const uniformBuildings = Boolean(exportOptions?.uniformBuildings);
  const colourBySource = Boolean(exportOptions?.colourBySource);
  const layout = layoutSheet(model.sideM, scale);
  const plan = planPaths(model, style.pathWidthM, style.contourIndexEvery, scale, style.contourCoarseIntervalM, style.contourCoarseFromScale, {
    buildingColour: {
      colourByUse: !uniformBuildings && !colourBySource && !colourByHeightReliability,
      uniformBuildings,
      colourBySource,
      colourByHeightReliability,
    },
    highlightManual: Boolean(exportOptions?.highlightManual),
    pathFilletM: style.pathFilletM,
  });

  const entities: string[] = [];
  if (colourByHeightReliability) {
    for (const layerName of Object.values(HEIGHT_RELIABILITY_EXPORT_LAYER)) {
      entities.push(
        buildingPolylines(plan, model, layout, layerName, (b) => b.heightReliabilityLayer === layerName && !b.site && !b.imported),
      );
    }
  } else {
    entities.push(buildingPolylines(plan, model, layout, "Buildings", (b) => !b.site && !b.imported));
  }

  const header = [
    "  0\nSECTION\n  2\nHEADER\n  0\nENDSEC",
    "  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n  70\n0",
  ];
  const layers = colourByHeightReliability
    ? Object.values(HEIGHT_RELIABILITY_EXPORT_LAYER)
    : ["Buildings"];
  for (const layer of layers) {
    header.push(`  0\nLAYER\n  2\n${dxfEsc(layer)}\n  70\n0\n  62\n7\n  6\nCONTINUOUS`);
  }
  header.push("  0\nENDTAB\n  0\nENDSEC");

  const body = entities.filter(Boolean).join("");
  return `${header.join("")}\n  0\nSECTION\n  2\nENTITIES\n${body}  0\nENDSEC\n  0\nEOF\n`;
}

/** Export layer name for one building when writing DXF with height reliability layers. */
export function heightReliabilityDxfLayer(model: CityModel, buildingId: number): string | null {
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building) return null;
  return HEIGHT_RELIABILITY_EXPORT_LAYER[heightReliabilityClass(building)];
}
