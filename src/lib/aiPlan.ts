import type { PdfChunk, Rgb } from "./aiDocument";
import { buildLayeredPdf } from "./aiDocument";
import {
  figureGround,
  layoutSheet,
  paperMillimetres,
  type SheetLayout,
} from "./figureGround";
import { formatCoord, openRing } from "./geo";
import {
  CONTOUR_COLOR,
  CONTOUR_DASH_MM,
  CONTOUR_GAP_MM,
  LINE_MM,
  hexRgb,
} from "./lineweights";
import { planPaths } from "./svgPlan";
import type { CityModel, Pt } from "../types";

export const SITE_LAYER_ORDER = [
  "Frame",
  "Buildings",
  "Roads",
  "Rail",
  "Paths",
  "Water",
  "Green",
  "Contours",
  "Trees",
  "Annotation",
] as const;

export const FIGURE_LAYER_ORDER = ["Frame", "Buildings", "Annotation"] as const;

const INK = hexRgb("#1c1b17");
const BLACK: Rgb = [0, 0, 0];
const PAPER = hexRgb("#f4f1ea");
const GREEN = hexRgb("#b7d39a");
const WATER = hexRgb("#9ec9d1");
const TREE = hexRgb("#6ea35a");
const TREE_EDGE = hexRgb("#245232");

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

function creditLine(layout: SheetLayout, interval: number | null): string {
  const parts = ["© OpenStreetMap contributors. CityCut."];
  if (interval) parts.push(`Contours every ${interval} m. Terrain © Mapterhorn.`);
  if (layout.note) parts.push(layout.note);
  return parts.join(" ");
}

function annotation(model: CityModel, layout: SheetLayout, interval: number | null): PdfChunk {
  const page = layout.pageHeightMm;
  const tip: [number, number] = [layout.northX, yUp(layout.northTipY, page)];
  const base: [number, number] = [layout.northX, yUp(layout.northBaseY, page)];
  const shaft: [number, number] = [layout.northX, yUp(layout.northTipY + 1.7, page)];
  const headL: [number, number] = [layout.northX - 0.9, yUp(layout.northTipY + 1.8, page)];
  const headR: [number, number] = [layout.northX + 0.9, yUp(layout.northTipY + 1.8, page)];
  const barBottom = yUp(layout.barY + layout.barHeightMm, page);
  const label = titleLine(model, layout);
  const credit = creditLine(layout, interval);
  return {
    name: "Annotation",
    paths: [
      {
        rings: [[[layout.barX, barBottom], [layout.barX + layout.barMm / 2, barBottom], [layout.barX + layout.barMm / 2, barBottom + layout.barHeightMm], [layout.barX, barBottom + layout.barHeightMm]]],
        fill: INK,
        close: true,
        evenOdd: false,
      },
      {
        rings: [[[layout.barX, barBottom], [layout.barX + layout.barMm, barBottom], [layout.barX + layout.barMm, barBottom + layout.barHeightMm], [layout.barX, barBottom + layout.barHeightMm]]],
        stroke: INK,
        strokeMm: LINE_MM.annotation,
        close: true,
      },
      {
        rings: [[base, shaft]],
        close: false,
        stroke: INK,
        strokeMm: LINE_MM.annotation,
        cap: "butt",
      },
      {
        rings: [[tip, headL, headR]],
        fill: INK,
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
        color: INK,
      },
      {
        x: layout.northX + 1.8,
        y: yUp(layout.northTipY + 3.2, page),
        sizeMm: 2.6,
        text: "N",
        color: INK,
      },
      {
        x: layout.edgeMm,
        y: yUp(layout.titleY, page),
        sizeMm: 2.6,
        text: label,
        color: INK,
      },
      {
        x: layout.edgeMm,
        y: yUp(layout.creditY, page),
        sizeMm: 2.2,
        text: credit,
        color: INK,
      },
    ],
  };
}

function frameStroke(layout: SheetLayout, color: Rgb): PdfChunk {
  const page = layout.pageHeightMm;
  const bottom = yUp(layout.frameY + layout.frameMm, page);
  const x = layout.frameX;
  const top = bottom + layout.frameMm;
  return {
    name: "Frame",
    paths: [
      {
        rings: [[[x, bottom], [x + layout.frameMm, bottom], [x + layout.frameMm, top], [x, top]]],
        stroke: color,
        strokeMm: LINE_MM.frame,
        close: true,
      },
    ],
  };
}

export function sitePlanChunks(model: CityModel, scale: number): PdfChunk[] {
  const layout = layoutSheet(model.sideM, scale);
  const plan = planPaths(model);
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
          fill: PAPER,
          close: true,
          evenOdd: false,
        },
      ],
    },
  ];

  const green = plan.green.map((rings) => mapRings(rings, model.sideM, layout)).filter((rings) => rings.length > 0);
  if (green.length > 0) {
    chunks.push({
      name: "Green",
      paths: green.map((rings) => ({ rings, fill: GREEN, evenOdd: true, close: true })),
    });
  }
  const water = plan.water.map((rings) => mapRings(rings, model.sideM, layout)).filter((rings) => rings.length > 0);
  if (water.length > 0) {
    chunks.push({
      name: "Water",
      paths: water.map((rings) => ({ rings, fill: WATER, evenOdd: true, close: true })),
    });
  }
  if (plan.contours.length > 0) {
    chunks.push({
      name: "Contours",
      paths: plan.contours.map((line) => ({
        rings: [mapRing(line, model.sideM, layout)],
        close: false,
        stroke: hexRgb(CONTOUR_COLOR),
        strokeMm: LINE_MM.contour,
        dashMm: [CONTOUR_DASH_MM, CONTOUR_GAP_MM] as const,
        cap: "butt" as const,
      })),
    });
  }
  if (plan.rails.length > 0) {
    chunks.push({
      name: "Rail",
      paths: plan.rails.map((rail) => ({
        rings: [mapRing(rail.line, model.sideM, layout)],
        close: false,
        stroke: hexRgb(rail.stroke),
        strokeMm: LINE_MM.secondary,
        cap: "round" as const,
        join: "round" as const,
      })),
    });
  }
  if (plan.paths.length > 0) {
    chunks.push({
      name: "Paths",
      paths: plan.paths.map((path) => ({
        rings: [mapRing(path.line, model.sideM, layout)],
        close: false,
        stroke: hexRgb(path.stroke),
        strokeMm: LINE_MM.secondary,
        cap: "round" as const,
        join: "round" as const,
      })),
    });
  }
  if (plan.roadEdges.length > 0) {
    chunks.push({
      name: "Roads",
      paths: plan.roadEdges.map((edge) => ({
        rings: [mapRing(edge.line, model.sideM, layout)],
        close: false,
        stroke: hexRgb(edge.stroke),
        strokeMm: LINE_MM.propertyRoad,
        cap: "round" as const,
        join: "round" as const,
      })),
    });
  }
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
          fill: TREE,
          stroke: TREE_EDGE,
          strokeMm: LINE_MM.secondary,
        };
      }),
    });
  }
  if (plan.buildings.length > 0) {
    chunks.push({
      name: "Buildings",
      paths: plan.buildings.map((building) => ({
        rings: mapRings(building.rings, model.sideM, layout),
        fill: hexRgb(building.fill),
        stroke: INK,
        strokeMm: LINE_MM.buildingCut,
        evenOdd: true,
        close: true,
        join: "miter" as const,
      })),
    });
  }
  chunks.push(frameStroke(layout, INK));
  chunks.push(annotation(model, layout, plan.contourInterval));
  return chunks;
}

function mapRings(rings: Pt[][], sideM: number, layout: SheetLayout): number[][][] {
  return rings.map((ring) => mapRing(ring, sideM, layout)).filter((ring) => ring.length >= 3);
}

export function figureGroundChunks(model: CityModel, scale: number): PdfChunk[] {
  const layout = layoutSheet(model.sideM, scale);
  const ground = figureGround(model.buildings, model.sideM);
  const chunks: PdfChunk[] = [];
  const paths = ground.polygons
    .map((polygon) => mapRings(polygon, model.sideM, layout))
    .filter((rings) => rings.length > 0)
    .map((rings) => ({
      rings,
      fill: BLACK,
      evenOdd: true,
      close: true,
    }));
  if (paths.length > 0) chunks.push({ name: "Buildings", paths });
  chunks.push(frameStroke(layout, BLACK));
  chunks.push(annotation(model, layout, null));
  return chunks;
}

export function sitePlanAi(model: CityModel, scale: number): Promise<Uint8Array> {
  const layout = layoutSheet(model.sideM, scale);
  return buildLayeredPdf(layout.pageWidthMm, layout.pageHeightMm, sitePlanChunks(model, scale), SITE_LAYER_ORDER);
}

export function figureGroundAi(model: CityModel, scale: number): Promise<Uint8Array> {
  const layout = layoutSheet(model.sideM, scale);
  return buildLayeredPdf(
    layout.pageWidthMm,
    layout.pageHeightMm,
    figureGroundChunks(model, scale),
    FIGURE_LAYER_ORDER,
  );
}
