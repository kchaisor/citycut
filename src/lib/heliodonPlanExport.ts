import type { PdfChunk, PdfEllipse, PdfPath } from "./aiDocument";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import {
  buildHeliodonDiagramOverlay,
  heliodonLabelFontMetres,
  type HeliodonDiagramExportOptions,
} from "./heliodonDiagram";
import { paperMillimetres, type SheetLayout } from "./figureGround";
import { SUN_PATH_STYLES } from "./heliodonSunPaths";
import {
  hiddenBySunStudy,
  sunStudyDateArc,
  sunStudySuns,
  type SunStudyDate,
} from "./sunStudyPlan";
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

function sunIconPaths(
  east: number,
  north: number,
  sizeM: number,
  sideM: number,
  layout: SheetLayout,
  ink: ReturnType<typeof hexRgb>,
  core: ReturnType<typeof hexRgb>,
): { paths: PdfPath[]; ellipses: PdfEllipse[] } {
  const paths: PdfPath[] = [];
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  const centre = sheetPoint(east, north, sideM, layout);
  const rayInner = paperMillimetres(sizeM * 0.55, layout.scale);
  const rayOuter = paperMillimetres(sizeM, layout.scale);
  const rayMm = 0.12;
  for (const deg of rays) {
    const t = (deg * Math.PI) / 180;
    const x1 = centre[0] + Math.cos(t) * rayInner;
    const y1 = centre[1] + Math.sin(t) * rayInner;
    const x2 = centre[0] + Math.cos(t) * rayOuter;
    const y2 = centre[1] + Math.sin(t) * rayOuter;
    paths.push({
      rings: [
        [
          [x1, y1],
          [x2, y2],
        ],
      ],
      close: false,
      stroke: ink,
      strokeMm: rayMm,
      cap: "round",
    });
  }
  const r = paperMillimetres(sizeM * 0.42, layout.scale);
  const ellipses: PdfEllipse[] = [
    {
      kind: "ellipse",
      cx: centre[0],
      cy: centre[1],
      rx: r,
      ry: r,
      fill: core,
      stroke: ink,
      strokeMm: 0.1,
    },
  ];
  return { paths, ellipses };
}

export function heliodonPlanPdfChunk(
  modelSideM: number,
  layout: SheetLayout,
  options: HeliodonDiagramExportOptions,
  planScale: number,
  sunStudy: SunStudyDate | null = null,
): PdfChunk {
  const overlay = buildHeliodonDiagramOverlay({ ...options, sideM: modelSideM });
  const ink = hexRgb(getColour("--sun-compass-label"));
  const grey = hexRgb(getColour("--sun-compass"));
  const paths: NonNullable<PdfChunk["paths"]> = [];
  const ellipses: PdfEllipse[] = [];
  const R = overlay.radiusM;
  const sunSize = R * 0.065;
  const hourFontMm = heliodonLabelFontMetres(planScale, 7);
  const hourFontSheet = paperMillimetres(hourFontMm, planScale);
  const studySuns = sunStudy ? sunStudySuns(sunStudy, R, sunSize, hourFontMm) : [];
  const studyArc =
    sunStudy &&
    !SUN_PATH_STYLES.some((style) => style.date.month === sunStudy.month && style.date.day === sunStudy.day) &&
    !(sunStudy.month === 3 && sunStudy.day === 20)
      ? sunStudyDateArc(sunStudy, R)
      : null;

  for (const ring of overlay.altitudeRings) {
    paths.push({
      rings: [mapRingLine(ring, modelSideM, layout)],
      close: true,
      stroke: grey,
      strokeMm: 0.16,
    });
  }

  paths.push({
    rings: [mapRingLine(overlay.horizonRing, modelSideM, layout)],
    close: true,
    stroke: ink,
    strokeMm: 0.24,
  });

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
    const dashM = R * 0.008;
    paths.push({
      rings: [mapRingLine(line, modelSideM, layout)],
      close: false,
      stroke: grey,
      strokeMm: 0.12,
      dashMm: [paperMillimetres(dashM, planScale), paperMillimetres(dashM, planScale)],
    });
  }

  for (const dot of overlay.hourDots) {
    const [cx, cy] = sheetPoint(dot[0], dot[1], modelSideM, layout);
    const dotR = paperMillimetres(R * 0.008, planScale);
    ellipses.push({ kind: "ellipse", cx, cy, rx: dotR, ry: dotR, fill: ink, stroke: ink, strokeMm: 0.08 });
  }

  const texts: NonNullable<PdfChunk["texts"]> = [
    ...overlay.degreeLabels.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      return { x, y, sizeMm: paperMillimetres(heliodonLabelFontMetres(planScale, 6.5), planScale), text: label.text, color: grey };
    }),
    ...overlay.cardinals.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      const sizeMm = paperMillimetres(heliodonLabelFontMetres(planScale, label.fontPt), planScale);
      return { x, y, sizeMm, text: label.text, color: ink };
    }),
    ...overlay.hourLabels
      .filter((label) => !sunStudy || !hiddenBySunStudy(label, studySuns, R))
      .map((label) => {
        const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
        return { x, y, sizeMm: paperMillimetres(heliodonLabelFontMetres(planScale, 7), planScale), text: label.text, color: ink };
      }),
    ...overlay.arcLabels.map((label) => {
      const [x, y] = sheetPoint(label.east, label.north, modelSideM, layout);
      return { x, y, sizeMm: paperMillimetres(heliodonLabelFontMetres(planScale, 7.5), planScale), text: label.text, color: ink };
    }),
  ];

  if (studyArc && studyArc.length >= 2) {
    paths.push({
      rings: [mapRingLine(studyArc, modelSideM, layout)],
      close: false,
      stroke: ink,
      strokeMm: 0.22,
    });
  }

  const sunCore = hexRgb(sunStudy ? getColour("--sun-study-sun") : getColour("--sun-marker"));
  if (!sunStudy && overlay.sun) {
    const icon = sunIconPaths(overlay.sun[0], overlay.sun[1], sunSize, modelSideM, layout, ink, sunCore);
    paths.push(...icon.paths);
    ellipses.push(...icon.ellipses);
  }
  for (const sun of studySuns) {
    const icon = sunIconPaths(sun.at[0], sun.at[1], sunSize, modelSideM, layout, ink, sunCore);
    paths.push(...icon.paths);
    ellipses.push(...icon.ellipses);
    const [lx, ly] = sheetPoint(sun.labelAt[0], sun.labelAt[1], modelSideM, layout);
    texts.push({ x: lx, y: ly, sizeMm: hourFontSheet, text: sun.label, color: ink });
  }

  return { name: "Sun path", paths, ellipses, texts };
}
