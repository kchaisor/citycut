import type { PdfChunk, PdfPath, Rgb } from "./aiDocument";
import { useNativeAi8Export } from "./aiExportFormat";
import { buildLayeredNativeAi } from "./aiNative";
import { buildLayeredNativeAiPdfOps } from "./aiNativePdfFallback";
import { buildLayeredPdf } from "./aiDocument";
import { getColour, type ColourKey } from "./colours";
import {
  dashIsDotted,
  dashPair,
  dashSegments,
  footpathEdgeStroke,
  haloMm,
  readDrawingStyle,
  type LineStyles,
  type StrokeStyle,
} from "./drawingStyle";
import {
  figureGround,
  layoutSheet,
  paperMillimetres,
  type SheetLayout,
} from "./figureGround";
import { formatCoord, openRing } from "./geo";
import { LINE_MM, hexRgb } from "./lineweights";
import { heliodonPlanPdfChunk } from "./heliodonPlanExport";
import type { HeliodonDiagramExportOptions } from "./heliodonDiagram";
import { planShadowRings, type PlanShadowInput } from "./buildingShadows";
import { SUN_STUDY_SHADOW_OPACITY } from "./sunStudyPlan";
import { planPaths } from "./svgPlan";
import { regionCredit } from "./sources/registry";
import { NSW_SITE_LAYERS, nswPlanChunks } from "./nswPlanExport";
import { importedMassingStrokeStyle, planBuildingStrokeStyle } from "./planBuildingFill";
import { windPlanPdfChunk } from "./windExport";
import { comBuildingHeightCreditLine } from "./comBuildingHeightCredit";
import { comTreesCreditLine } from "./comTreesCredit";
import { plainDataCredit } from "./dataCredits";
import {
  explodedAxoChunks,
  explodedAxoPageSize,
  EXPLODED_AXO_LAYER_ORDER,
} from "./explodedAxoExport";
import { defaultExplodedAxoSettings, type ExplodedAxoSettings } from "./explodedAxo";
import { stableExportModel } from "./exportStableOrder";
import type { CityModel, ContourSourceId, Pt, Ring } from "../types";

export const SITE_LAYER_ORDER = [
  "Frame",
  "Green",
  "Water",
  "Contours",
  "Contour labels",
  "Paths",
  "Roads",
  "Blocks",
  "Rail",
  "Trams",
  "Buildings",
  "Site buildings",
  "Imported massing",
  "Site boundary",
  "Trees",
  "Shadows",
  "Sun path",
  "Wind",
  "Annotation",
] as const;

export const FIGURE_LAYER_ORDER = ["Frame", "Buildings", "Paths", "Sun path", "Annotation"] as const;

/** Sheet colour. A path or rail casing uses this so it vanishes on the page and reads on the road fill. */
function fillOf(name: ColourKey): Rgb {
  return hexRgb(getColour(name));
}

function pen(style: StrokeStyle, join: "miter" | "round" = "round"): Partial<PdfPath> | null {
  if (!(style.mm > 0)) return null;
  const dash = dashSegments(style.dash);
  const dotted = dashIsDotted(style.dash);
  return {
    stroke: hexRgb(style.color),
    strokeMm: style.mm,
    ...(dash ? { dashMm: dash } : {}),
    cap: dotted || (dash?.some((segment, index) => segment === 0 && index % 2 === 0) ?? false) ? "round" : "butt",
    join,
  };
}

function sheetPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

function mapRing(ring: Pt[], sideM: number, layout: SheetLayout): number[][] {
  return openRing(ring).map((point) => sheetPoint(point[0], point[1], sideM, layout));
}

function yUp(yDown: number, pageHeightMm: number): number {
  return pageHeightMm - yDown;
}

function titleLine(model: CityModel, layout: SheetLayout): string {
  return `${model.placeLabel} · 1:${layout.scale} · ${formatCoord(model.center.lat)}, ${formatCoord(model.center.lon)}`;
}

function creditLine(
  model: CityModel,
  layout: SheetLayout,
  interval: number | null,
  source: ContourSourceId | null,
  windOn: boolean,
): string {
  const parts = [plainDataCredit({ prefix: "CityCut.", windOn, satelliteOn: false, ...(model.region === "nsw" ? { nsw: true } : {}) })];
  const comCredit = comBuildingHeightCreditLine(model);
  if (comCredit) parts.push(comCredit);
  const treesCredit = comTreesCreditLine(model);
  if (treesCredit) parts.push(`${treesCredit}.`);
  if (interval && (source === "vicmap-metro" || source === "vicmap-state")) {
    parts.push(`Contours every ${interval} m.`);
  } else if (interval) {
    parts.push(`Contours every ${interval} m.`);
  }
  const nswCredit = regionCredit(model.region);
  if (nswCredit) parts.push(`${nswCredit}.`);
  if (layout.note) parts.push(layout.note);
  return parts.join(" ");
}

function annotation(
  model: CityModel,
  layout: SheetLayout,
  interval: number | null,
  style: StrokeStyle,
  source: ContourSourceId | null = null,
  windOn = false,
): PdfChunk {
  const ink = hexRgb(style.color);
  const page = layout.pageHeightMm;
  const tip: [number, number] = [layout.northX, yUp(layout.northTipY, page)];
  const base: [number, number] = [layout.northX, yUp(layout.northBaseY, page)];
  const shaft: [number, number] = [layout.northX, yUp(layout.northTipY + 1.7, page)];
  const headL: [number, number] = [layout.northX - 0.9, yUp(layout.northTipY + 1.8, page)];
  const headR: [number, number] = [layout.northX + 0.9, yUp(layout.northTipY + 1.8, page)];
  const barBottom = yUp(layout.barY + layout.barHeightMm, page);
  const label = titleLine(model, layout);
  const credit = creditLine(model, layout, interval, source, windOn);
  return {
    name: "Annotation",
    paths: [
      {
        rings: [[[layout.barX, barBottom], [layout.barX + layout.barMm / 2, barBottom], [layout.barX + layout.barMm / 2, barBottom + layout.barHeightMm], [layout.barX, barBottom + layout.barHeightMm]]],
        fill: ink,
        close: true,
        evenOdd: false,
      },
      {
        rings: [[[layout.barX, barBottom], [layout.barX + layout.barMm, barBottom], [layout.barX + layout.barMm, barBottom + layout.barHeightMm], [layout.barX, barBottom + layout.barHeightMm]]],
        stroke: ink,
        strokeMm: style.mm,
        ...(dashPair(style.dash) ? { dashMm: dashPair(style.dash)! } : {}),
        cap: dashIsDotted(style.dash) ? "round" : "butt",
        close: true,
      },
      {
        rings: [[base, shaft]],
        close: false,
        stroke: ink,
        strokeMm: style.mm,
        ...(dashPair(style.dash) ? { dashMm: dashPair(style.dash)! } : {}),
        cap: dashIsDotted(style.dash) ? "round" : "butt",
      },
      {
        rings: [[tip, headL, headR]],
        fill: ink,
        close: true,
        evenOdd: false,
      },
    ],
    texts: [
      {
        x: layout.barX + layout.barMm + 1.8,
        y: yUp(layout.barY + layout.barHeightMm * 0.82, page),
        sizeMm: 2.3,
        text: `${layout.barMetres} m`,
        color: ink,
      },
      {
        x: layout.edgeMm,
        y: yUp(layout.titleY, page),
        sizeMm: 2.6,
        text: label,
        color: ink,
      },
      {
        x: layout.edgeMm,
        y: yUp(layout.creditY, page),
        sizeMm: 2.2,
        text: credit,
        color: ink,
      },
    ],
  };
}

function frameStroke(layout: SheetLayout, style: StrokeStyle): PdfChunk {
  const page = layout.pageHeightMm;
  const bottom = yUp(layout.frameY + layout.frameMm, page);
  const x = layout.frameX;
  const top = bottom + layout.frameMm;
  const drawn = pen(style, "miter");
  return {
    name: "Frame",
    paths: [
      {
        rings: [[[x, bottom], [x + layout.frameMm, bottom], [x + layout.frameMm, top], [x, top]]],
        ...(drawn ?? { stroke: hexRgb(style.color), strokeMm: style.mm }),
        close: true,
      },
    ],
  };
}

/**
 * Site-plan layers. Colours, weights, and dashes come from `style`, which
 * `readDrawingStyle` fills from `getComputedStyle(document.documentElement)`
 * at export time. That computed style is the drawing-style.css cascade, plus
 * any inline variables the Line styles editor has set.
 */
function pathStrip(polygons: Pt[][][], model: CityModel, layout: SheetLayout, style: LineStyles): PdfChunk | null {
  const rings = polygons.flatMap((polygon) => mapRings(polygon, model.sideM, layout));
  if (rings.length === 0) return null;
  const edgePen = footpathEdgeStroke(style);
  const edge = edgePen ? pen(edgePen) : null;
  return {
    name: "Paths",
    paths: [
      {
        rings,
        fill: hexRgb(style.pathFill),
        evenOdd: true,
        close: true,
        join: "round",
        ...(edge ?? {}),
      },
    ],
  };
}

export type SitePlanExportOptions = {
  heliodon?: HeliodonDiagramExportOptions | null;
  shadows?: PlanShadowInput | null;
  castShadows?: boolean;
  uniformBuildings?: boolean;
  highlightManual?: boolean;
  colourBySource?: boolean;
  wind?: { table: import("./windRose").WindRoseTable; period: import("./windRose").WindPeriodId } | null;
  /**
   * Sun study: one shadow layer per hour ("Shadow 09:00" …), each at the study opacity, in place
   * of the single Shadows layer. Rings are the plan shadows already computed for the screen.
   */
  sunStudy?: { layers: { hour: number; rings: Ring[][] }[] } | null;
};

/** Layer name for one sun-study hour, e.g. 9 -> "Shadow 09:00". */
export function sunStudyLayerName(hour: number): string {
  return `Shadow ${String(hour).padStart(2, "0")}:00`;
}

export function siteBoundaryChunk(
  lines: Pt[][],
  model: CityModel,
  layout: SheetLayout,
  style: LineStyles,
): PdfChunk | null {
  if (lines.length === 0) return null;
  const boundaryPen = pen(style.siteBoundary);
  if (!boundaryPen) return null;
  return {
    name: "Site boundary",
    paths: lines
      .map((line) => mapRing(line, model.sideM, layout))
      .filter((ring) => ring.length >= 2)
      .map((ring) => ({
        rings: [ring],
        close: false,
        cap: "round" as const,
        join: "round" as const,
        ...boundaryPen,
      })),
  };
}

function resolveSitePlanExport(
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): SitePlanExportOptions {
  if (!exportOptions) return {};
  if (
    "shadows" in exportOptions ||
    "castShadows" in exportOptions ||
    "heliodon" in exportOptions ||
    "wind" in exportOptions ||
    "sunStudy" in exportOptions ||
    "uniformBuildings" in exportOptions
  ) {
    return exportOptions as SitePlanExportOptions;
  }
  return { heliodon: exportOptions as HeliodonDiagramExportOptions };
}

export function sitePlanChunks(
  model: CityModel,
  scale: number,
  style: LineStyles = readDrawingStyle(),
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): PdfChunk[] {
  model = stableExportModel(model);
  const resolved = resolveSitePlanExport(exportOptions);
  const heliodon = resolved.heliodon ?? null;
  const shadowInput = resolved.shadows ?? null;
  const castShadows = Boolean(resolved.castShadows);
  const layout = layoutSheet(model.sideM, scale);
  const uniformBuildings = Boolean(resolved.uniformBuildings);
  const colourBySource = Boolean(resolved.colourBySource);
  const highlightManual = Boolean(resolved.highlightManual);
  const plan = planPaths(
    model,
    style.pathWidthM,
    style.contourIndexEvery,
    scale,
    style.contourCoarseIntervalM,
    style.contourCoarseFromScale,
    {
      buildingColour: {
        colourByUse: !uniformBuildings && !colourBySource,
        uniformBuildings,
        colourBySource,
      },
      highlightManual,
      pathFilletM: style.pathFilletM,
    },
  );
  const page = layout.pageHeightMm;
  const bottom = yUp(layout.frameY + layout.frameMm, page);
  const chunks: PdfChunk[] = [
    {
      name: "Frame",
      paths: [
        {
          rings: [[
            [layout.frameX, bottom],
            [layout.frameX + layout.frameMm, bottom],
            [layout.frameX + layout.frameMm, bottom + layout.frameMm],
            [layout.frameX, bottom + layout.frameMm],
          ]],
          fill: fillOf("--sheet-fill"),
          close: true,
          evenOdd: false,
        },
      ],
    },
  ];

  const greenPen = pen(style.green);
  const green = plan.green.map((rings) => mapRings(rings, model.sideM, layout)).filter((rings) => rings.length > 0);
  if (green.length > 0) {
    chunks.push({
      name: "Green",
      paths: green.map((rings) => ({
        rings,
        fill: fillOf("--green-fill"),
        evenOdd: true,
        close: true,
        ...(greenPen ?? {}),
      })),
    });
  }
  const waterPen = pen(style.water);
  const water = plan.water.map((rings) => mapRings(rings, model.sideM, layout)).filter((rings) => rings.length > 0);
  if (water.length > 0) {
    chunks.push({
      name: "Water",
      paths: water.map((rings) => ({
        rings,
        fill: fillOf("--water-fill"),
        evenOdd: true,
        close: true,
        ...(waterPen ?? {}),
      })),
    });
  }
  const footpaths = pathStrip(plan.pathFill, model, layout, style);
  if (footpaths) chunks.push(footpaths);
  const contourPen = pen(style.contour);
  const indexPen = pen({ ...style.contour, mm: style.contourIndexMm });
  if (plan.contours.length > 0 && contourPen) {
    chunks.push({
      name: "Contours",
      paths: plan.contours.map((line, index) => ({
        rings: [mapRing(line, model.sideM, layout)],
        close: false,
        ...(plan.contourIndex[index] && indexPen ? indexPen : contourPen),
      })),
    });
  }
  // NSW mode only (model.nsw); Victorian sheets get no NSW chunks.
  const nswChunks = nswPlanChunks(model, layout);
  const roadRings = plan.roadFill.flatMap((polygon) => mapRings(polygon, model.sideM, layout));
  const blockFill = plan.blocks
    .map((rings) => mapRings(rings, model.sideM, layout))
    .filter((rings) => rings.length > 0);
  if (blockFill.length > 0) {
    chunks.push({
      name: "Blocks",
      paths: blockFill.map((rings) => ({
        rings,
        fill: fillOf("--block-plan"),
        evenOdd: true,
        close: true,
      })),
    });
  }
  chunks.push(...nswChunks.under);
  if (roadRings.length > 0) {
    const kerb = style.kerbOn ? pen(style.kerb) : null;
    chunks.push({
      name: "Roads",
      paths: [
        {
          rings: roadRings,
          fill: hexRgb(style.roadFill),
          evenOdd: true,
          close: true,
          join: "round",
          ...(kerb ?? {}),
        },
      ],
    });
  }
  const railPen = pen(style.rail);
  if (plan.rails.length > 0 && railPen) {
    chunks.push({
      name: "Rail",
      paths: plan.rails.flatMap((line) => casedLine(mapRing(line, model.sideM, layout), style.rail, railPen)),
    });
  }
  const tramPen = pen(style.tram);
  if (plan.trams.length > 0 && tramPen) {
    chunks.push({
      name: "Trams",
      paths: plan.trams.map((line) => ({
        rings: [mapRing(line, model.sideM, layout)],
        close: false,
        cap: "round" as const,
        join: "round" as const,
        ...tramPen,
      })),
    });
  }
  chunks.push(...nswChunks.lines);
  const treePen = pen(style.tree);
  if (plan.trees.length > 0) {
    chunks.push({
      name: "Trees",
      ellipses: plan.trees.map((tree) => {
        const [cx, cy] = sheetPoint(tree.east, tree.north, model.sideM, layout);
        const radius = paperMillimetres(tree.r, scale);
        return {
          kind: "ellipse" as const,
          cx,
          cy,
          rx: radius,
          ry: radius,
          fill: fillOf("--tree-fill"),
          ...(treePen ?? {}),
        };
      }),
    });
  }
  const studyLayers = resolved.sunStudy?.layers ?? null;
  for (const layer of studyLayers ?? []) {
    if (layer.rings.length === 0) continue;
    chunks.push({
      name: sunStudyLayerName(layer.hour),
      paths: layer.rings.map((rings) => ({
        rings: mapRings(rings, model.sideM, layout),
        fill: fillOf("--sun-study-shadow"),
        opacity: SUN_STUDY_SHADOW_OPACITY,
        evenOdd: true,
        close: true,
      })),
    });
  }
  const shadowRings = shadowInput && !studyLayers ? planShadowRings(model, shadowInput, castShadows) : [];
  if (shadowRings.length > 0) {
    chunks.push({
      name: "Shadows",
      paths: shadowRings.map((rings) => ({
        rings: mapRings(rings, model.sideM, layout),
        fill: fillOf("--shadow-fill"),
        opacity: SUN_STUDY_SHADOW_OPACITY,
        evenOdd: true,
        close: true,
      })),
    });
  }
  const buildingPen = pen(planBuildingStrokeStyle(style, uniformBuildings, false), "miter");
  const siteBuildingPen = pen(style.siteBuilding, "miter");
  const siteBuildings = plan.buildings.filter((building) => building.site);
  const importedBuildings = plan.buildings.filter((building) => building.imported);
  const otherBuildings = plan.buildings.filter((building) => !building.site && !building.imported);
  if (otherBuildings.length > 0) {
    chunks.push({
      name: "Buildings",
      paths: otherBuildings.map((building) => ({
        rings: mapRings(building.rings, model.sideM, layout),
        fill: hexRgb(building.fill),
        evenOdd: true,
        close: true,
        ...(buildingPen ?? {}),
      })),
    });
  }
  if (siteBuildings.length > 0) {
    chunks.push({
      name: "Site buildings",
      paths: siteBuildings.map((building) => ({
        rings: mapRings(building.rings, model.sideM, layout),
        fill: hexRgb(building.fill),
        evenOdd: true,
        close: true,
        ...(siteBuildingPen ?? buildingPen ?? {}),
      })),
    });
  }
  if (importedBuildings.length > 0) {
    const importedPen = pen(importedMassingStrokeStyle(style), "miter");
    chunks.push({
      name: "Imported massing",
      paths: importedBuildings.map((building) => ({
        rings: mapRings(building.rings, model.sideM, layout),
        fill: hexRgb(building.fill),
        evenOdd: true,
        close: true,
        ...(importedPen ?? buildingPen ?? {}),
      })),
    });
  }
  const siteBoundary = siteBoundaryChunk(model.siteBoundaryLines ?? [], model, layout, style);
  if (siteBoundary) chunks.push(siteBoundary);
  if (resolved.wind?.table) chunks.push(windPlanPdfChunk(resolved.wind.table, resolved.wind.period, layout, model.sideM));
  chunks.push(...nswChunks.labels);
  chunks.push(frameStroke(layout, style.frame));
  if (heliodon) chunks.push(heliodonPlanPdfChunk(model.sideM, layout, heliodon, scale));
  chunks.push(
    annotation(
      model,
      layout,
      plan.contourInterval,
      style.annotation,
      plan.contourSource,
      Boolean(resolved.wind?.table),
    ),
  );
  return chunks;
}

/** A paper casing under the stroke, so the line still shows on the dark road fill. */
function casedLine(ring: number[][], style: StrokeStyle, drawn: Partial<PdfPath>): PdfPath[] {
  const casing = haloMm(style.mm);
  const line: PdfPath = { rings: [ring], close: false, ...drawn, cap: "round", join: "round" };
  if (!(casing > style.mm)) return [line];
  return [
    { rings: [ring], close: false, stroke: fillOf("--sheet-fill"), strokeMm: casing, cap: "round", join: "round" },
    line,
  ];
}

function mapRings(rings: Pt[][], sideM: number, layout: SheetLayout): number[][][] {
  return rings.map((ring) => mapRing(ring, sideM, layout)).filter((ring) => ring.length >= 3);
}

export function figureGroundChunks(
  model: CityModel,
  scale: number,
  style: LineStyles = readDrawingStyle(),
  heliodon?: HeliodonDiagramExportOptions | null,
): PdfChunk[] {
  model = stableExportModel(model);
  const layout = layoutSheet(model.sideM, scale);
  const frameShape = model.frameShape ?? "square";
  const ground = figureGround(model.buildings, model.sideM, frameShape);
  const chunks: PdfChunk[] = [];
  const paths = ground.polygons
    .map((polygon) => mapRings(polygon, model.sideM, layout))
    .filter((rings) => rings.length > 0)
    .map((rings) => ({
      rings,
      fill: fillOf("--figure-fill"),
      evenOdd: true,
      close: true,
    }));
  if (paths.length > 0) chunks.push({ name: "Buildings", paths });
  chunks.push(frameStroke(layout, { mm: LINE_MM.frame, color: getColour("--figure-fill"), dash: "none" }));
  if (heliodon) chunks.push(heliodonPlanPdfChunk(model.sideM, layout, heliodon, scale));
  chunks.push(annotation(model, layout, null, { mm: LINE_MM.annotation, color: style.annotation.color, dash: "none" }));
  return chunks;
}

export function sitePlanLayerOrder(chunks: PdfChunk[]): string[] {
  const order: string[] = [...SITE_LAYER_ORDER];
  const studyNames = chunks.map((chunk) => chunk.name).filter((name) => /^Shadow \d\d:00$/.test(name));
  if (studyNames.length > 0) order.splice(order.indexOf("Shadows") + 1, 0, ...studyNames);
  if (!order.includes("Contour labels") && chunks.some((chunk) => chunk.name === "Contour labels")) {
    const at = order.indexOf("Contours");
    order.splice(at + 1, 0, "Contour labels");
  }
  // NSW layers only when the sheet has them, so Victorian layer lists are unchanged.
  const nsw = NSW_SITE_LAYERS.filter((name) => chunks.some((chunk) => chunk.name === name));
  if (nsw.length > 0) {
    const under = nsw.filter((name) => name === "NSW zoning" || name === "NSW road corridors");
    const lines = nsw.filter((name) => name !== "NSW zoning" && name !== "NSW road corridors" && name !== "NSW planning labels");
    order.splice(order.indexOf("Blocks") + 1, 0, ...under);
    order.splice(order.indexOf("Trams") + 1, 0, ...lines);
    if (nsw.includes("NSW planning labels")) order.splice(order.indexOf("Wind") + 1, 0, "NSW planning labels");
  }
  return order;
}

/** PDF/OCG site plan, the default .ai export. */
export async function sitePlanPdf(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): Promise<Uint8Array> {
  const layout = layoutSheet(model.sideM, scale);
  const chunks = sitePlanChunks(model, scale, style ?? readDrawingStyle(), exportOptions);
  return buildLayeredPdf(layout.pageWidthMm, layout.pageHeightMm, chunks, sitePlanLayerOrder(chunks));
}

export async function figureGroundPdf(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  heliodon?: HeliodonDiagramExportOptions | null,
): Promise<Uint8Array> {
  const layout = layoutSheet(model.sideM, scale);
  return buildLayeredPdf(
    layout.pageWidthMm,
    layout.pageHeightMm,
    figureGroundChunks(model, scale, style ?? readDrawingStyle(), heliodon),
    FIGURE_LAYER_ORDER,
  );
}

/** Layered SVG site plan: the same layers and paint order as the .ai. */
export async function sitePlanSvg(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): Promise<string> {
  const { buildLayeredSvg } = await import("./svgDocument");
  const layout = layoutSheet(model.sideM, scale);
  const chunks = sitePlanChunks(model, scale, style ?? readDrawingStyle(), exportOptions);
  return buildLayeredSvg(layout.pageWidthMm, layout.pageHeightMm, chunks, sitePlanLayerOrder(chunks));
}

/** Layered SVG figure-ground. */
export async function figureGroundSvg(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  heliodon?: HeliodonDiagramExportOptions | null,
): Promise<string> {
  const { buildLayeredSvg } = await import("./svgDocument");
  const layout = layoutSheet(model.sideM, scale);
  return buildLayeredSvg(
    layout.pageWidthMm,
    layout.pageHeightMm,
    figureGroundChunks(model, scale, style ?? readDrawingStyle(), heliodon),
    FIGURE_LAYER_ORDER,
  );
}

/** Illustrator 8 EPS site plan. Opt-in with VITE_CITYCUT_AI_NATIVE=true. */
export function sitePlanAi8(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): Uint8Array {
  const layout = layoutSheet(model.sideM, scale);
  const chunks = sitePlanChunks(model, scale, style ?? readDrawingStyle(), exportOptions);
  return buildLayeredNativeAi(
    layout.pageWidthMm,
    layout.pageHeightMm,
    chunks,
    sitePlanLayerOrder(chunks),
    titleLine(model, layout),
  );
}

export function figureGroundAi8(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  heliodon?: HeliodonDiagramExportOptions | null,
): Uint8Array {
  const layout = layoutSheet(model.sideM, scale);
  return buildLayeredNativeAi(
    layout.pageWidthMm,
    layout.pageHeightMm,
    figureGroundChunks(model, scale, style ?? readDrawingStyle(), heliodon),
    FIGURE_LAYER_ORDER,
    titleLine(model, layout),
  );
}

export async function sitePlanAi(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): Promise<Uint8Array> {
  if (useNativeAi8Export()) return sitePlanAi8(model, scale, style, exportOptions);
  if (import.meta.env.VITE_CITYCUT_AI_PDF_OPS === "true") {
    const layout = layoutSheet(model.sideM, scale);
    const chunks = sitePlanChunks(model, scale, style ?? readDrawingStyle(), exportOptions);
    return buildLayeredNativeAiPdfOps(
      layout.pageWidthMm,
      layout.pageHeightMm,
      chunks,
      sitePlanLayerOrder(chunks),
      titleLine(model, layout),
    );
  }
  return sitePlanPdf(model, scale, style, exportOptions);
}

export async function figureGroundAi(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  heliodon?: HeliodonDiagramExportOptions | null,
): Promise<Uint8Array> {
  if (useNativeAi8Export()) return figureGroundAi8(model, scale, style, heliodon);
  if (import.meta.env.VITE_CITYCUT_AI_PDF_OPS === "true") {
    const layout = layoutSheet(model.sideM, scale);
    return buildLayeredNativeAiPdfOps(
      layout.pageWidthMm,
      layout.pageHeightMm,
      figureGroundChunks(model, scale, style ?? readDrawingStyle(), heliodon),
      FIGURE_LAYER_ORDER,
      titleLine(model, layout),
    );
  }
  return figureGroundPdf(model, scale, style, heliodon);
}

export async function explodedAxoPdf(
  model: CityModel,
  scale: number,
  settings: ExplodedAxoSettings = defaultExplodedAxoSettings(model.sideM),
  satelliteNote = "Satellite imagery omitted from this file.",
): Promise<Uint8Array> {
  const { loadExplodedAxoOverlayBundle } = await import("./explodedAxoOverlays");
  const overlays = await loadExplodedAxoOverlayBundle(model, settings.layerVisible);
  const page = explodedAxoPageSize(model, settings, scale);
  const chunks = explodedAxoChunks(model, scale, settings, satelliteNote, overlays);
  return buildLayeredPdf(page.widthMm, page.heightMm, chunks, [...EXPLODED_AXO_LAYER_ORDER]);
}

export async function explodedAxoAi(
  model: CityModel,
  scale: number,
  settings?: ExplodedAxoSettings,
  satelliteNote?: string,
): Promise<Uint8Array> {
  return explodedAxoPdf(model, scale, settings, satelliteNote);
}
