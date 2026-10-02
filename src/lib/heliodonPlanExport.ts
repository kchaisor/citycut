import type { PdfChunk, PdfEllipse } from "./aiDocument";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { buildHeliodonPlanOverlay, type HeliodonPlanExportOptions } from "./heliodonPlan";
import { paperMillimetres, type SheetLayout } from "./figureGround";
import type { Pt } from "../types";

function sheetPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

function mapRingLine(line: Pt[], sideM: number, layout: SheetLayout): number[][] {
  const ring: number[][] = [];
  for (const point of line) ring.push(sheetPoint(point[0], point[1], sideM, layout));
  return ring;
}

function parseDashMm(dash: string | undefined, planScale: number): [number, number] | null {
  if (!dash) return null;
  const parts = dash.split(/\s+/).map(Number);
  if (parts.length < 2 || parts.some((value) => !Number.isFinite(value))) return null;
  return [paperMillimetres(parts[0], planScale), paperMillimetres(parts[1], planScale)];
}

/** Site-plan Sun path layer for PDF / native .ai exports. */
export function heliodonPlanPdfChunk(
  modelSideM: number,
  layout: SheetLayout,
  options: HeliodonPlanExportOptions,
  planScale: number,
): PdfChunk {
  const overlay = buildHeliodonPlanOverlay({ ...options, sideM: modelSideM });
  const ink = hexRgb(getColour("--sun-compass-label"));
  const grey = hexRgb(getColour("--sun-compass"));
  const paths: NonNullable<PdfChunk["paths"]> = [];
  const ellipses: PdfEllipse[] = [];

  paths.push({
    rings: [mapRingLine(overlay.horizonRing, modelSideM, layout)],
    close: true,
    stroke: ink,
    strokeMm: 0.25,
  });

  for (const ring of overlay.altitudeRings) {
    paths.push({
      rings: [mapRingLine(ring, modelSideM, layout)],
      close: true,
      stroke: grey,
      strokeMm: 0.15,
    });
  }

  for (const tick of overlay.ticks) {
    const width = tick.tier === "major" ? 0.22 : tick.tier === "medium" ? 0.18 : 0.14;
    paths.push({
      rings: [mapRingLine([tick.a, tick.b], modelSideM, layout)],
      close: false,
      stroke: tick.tier === "minor" ? grey : ink,
      strokeMm: width,
    });
  }

  for (const arc of overlay.arcs) {
    const dash = parseDashMm(arc.dash, planScale);
    paths.push({
      rings: [mapRingLine(arc.points, modelSideM, layout)],
      close: false,
      stroke: hexRgb(arc.colour),
      strokeMm: 0.22,
      ...(dash ? { dashMm: dash } : {}),
    });
  }

  for (const line of overlay.hourLines) {
    paths.push({
      rings: [mapRingLine(line, modelSideM, layout)],
      close: false,
      stroke: grey,
      strokeMm: 0.12,
      dashMm: [1.2, 1.2],
    });
  }

  for (const dot of overlay.hourDots) {
    const [cx, cy] = sheetPoint(dot[0], dot[1], modelSideM, layout);
    ellipses.push({ kind: "ellipse", cx, cy, rx: 0.9, ry: 0.9, fill: ink, stroke: ink, strokeMm: 0.1 });
  }

  if (overlay.sun) {
    const [cx, cy] = sheetPoint(overlay.sun[0], overlay.sun[1], modelSideM, layout);
    ellipses.push({ kind: "ellipse", cx, cy, rx: 2.2, ry: 2.2, fill: hexRgb(getColour("--sun-marker")) });
  }

  const texts: NonNullable<PdfChunk["texts"]> = [
    ...overlay.degreeLabels.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      return { x, y, sizeMm: 1.5, text: label.text, color: grey };
    }),
    ...overlay.cardinals.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      return { x, y, sizeMm: label.text === "N" ? 2.8 : 2.2, text: label.text, color: ink };
    }),
    ...overlay.hourLabels.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      return { x, y, sizeMm: 1.8, text: label.text, color: ink };
    }),
    ...overlay.arcLabels.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      return { x, y, sizeMm: 2, text: label.text, color: ink };
    }),
  ];

  return { name: "Sun path", paths, ellipses, texts };
}
