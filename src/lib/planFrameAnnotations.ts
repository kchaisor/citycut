import type { PdfChunk, PdfPath, PdfText, Rgb } from "./aiDocument";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { scaleBarMetres, type SheetLayout } from "./figureGround";
import { readDrawingStyle, type StrokeStyle } from "./drawingStyle";

function sheetPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

function mapPt(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  return sheetPoint(east, north, sideM, layout);
}

function linePath(a: Pt2, b: Pt2, stroke: Rgb, mm: number, cap: "round" | "butt" = "round"): PdfPath {
  return {
    rings: [[a, b]],
    close: false,
    stroke,
    strokeMm: mm,
    cap,
    join: "round",
  };
}

type Pt2 = [number, number];

export type PlanFrameAnnotationInput = {
  sideM: number;
  layout: SheetLayout;
  ink: Rgb;
  paper: Rgb;
  stroke: StrokeStyle;
};

export function planNorthArrowChunk(input: PlanFrameAnnotationInput): PdfChunk {
  const { sideM, layout, ink, paper, stroke } = input;
  const half = sideM / 2;
  const northR = sideM * 0.0155;
  const northCx = half - northR - sideM * 0.004;
  const northPlan = half + sideM * 0.033;
  const noteMm = stroke.mm;
  const paths: PdfPath[] = [];
  const cx = northCx;
  const cyPlan = northPlan;
  const centre = mapPt(cx, cyPlan, sideM, layout);
  const rMm = paperMillimetresFromGround(northR, sideM, layout.frameMm);
  paths.push({
    rings: [ellipseRing(centre[0], centre[1], rMm, rMm, 24)],
    close: true,
    stroke: ink,
    strokeMm: 0.2,
  });
  const tick = northR * 0.32;
  paths.push(linePath(mapPt(cx - northR - tick, cyPlan, sideM, layout), mapPt(cx - northR * 0.55, cyPlan, sideM, layout), ink, noteMm));
  paths.push(linePath(mapPt(cx + northR * 0.55, cyPlan, sideM, layout), mapPt(cx + northR + tick, cyPlan, sideM, layout), ink, noteMm));
  paths.push(linePath(mapPt(cx, cyPlan - northR * 0.45, sideM, layout), mapPt(cx, cyPlan - northR - tick, sideM, layout), ink, noteMm));
  const apexPlan = northPlan + northR * 1.28;
  const wingPlan = northPlan - northR * 0.68;
  const notchPlan = northPlan - northR * 0.32;
  const wingW = northR * 0.52;
  paths.push({
    rings: [
      [
        mapPt(cx, apexPlan, sideM, layout),
        mapPt(cx - wingW, wingPlan, sideM, layout),
        mapPt(cx, notchPlan, sideM, layout),
      ],
    ],
    close: true,
    fill: ink,
    stroke: ink,
    strokeMm: 0.15,
    join: "round",
  });
  paths.push({
    rings: [
      [
        mapPt(cx, apexPlan, sideM, layout),
        mapPt(cx + wingW, wingPlan, sideM, layout),
        mapPt(cx, notchPlan, sideM, layout),
      ],
    ],
    close: true,
    fill: paper,
    stroke: ink,
    strokeMm: 0.15,
    join: "round",
  });
  const texts: PdfText[] = [
    {
      x: centre[0],
      y: mapPt(cx, apexPlan + northR * 0.38, sideM, layout)[1],
      sizeMm: (sideM * 0.016 * 1000) / layout.scale,
      text: "N",
      color: ink,
    },
  ];
  return { name: "North arrow", paths, texts };
}

function paperMillimetresFromGround(groundM: number, sideM: number, frameMm: number): number {
  return (groundM / sideM) * frameMm;
}

function ellipseRing(cx: number, cy: number, rx: number, ry: number, steps: number): Pt2[] {
  const ring: Pt2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    ring.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return ring;
}

export function planScaleBarChunk(input: PlanFrameAnnotationInput): PdfChunk {
  const { sideM, layout, ink, stroke } = input;
  const half = sideM / 2;
  const barMetres = scaleBarMetres(sideM, layout.scale);
  const barThickness = Math.max(sideM * 0.005, 0.6);
  const barNorth = -(half + sideM * 0.028);
  const barEast = -half;
  const thickMm = paperMillimetresFromGround(barThickness, sideM, layout.frameMm);
  const barLenMm = paperMillimetresFromGround(barMetres, sideM, layout.frameMm);
  const halfLenMm = paperMillimetresFromGround(barMetres / 2, sideM, layout.frameMm);
  const bl = mapPt(barEast, barNorth, sideM, layout);
  const paths: PdfPath[] = [
    {
      rings: [
        [
          bl,
          [bl[0] + halfLenMm, bl[1]],
          [bl[0] + halfLenMm, bl[1] + thickMm],
          [bl[0], bl[1] + thickMm],
        ],
      ],
      close: true,
      fill: ink,
    },
    {
      rings: [
        [
          bl,
          [bl[0] + barLenMm, bl[1]],
          [bl[0] + barLenMm, bl[1] + thickMm],
          [bl[0], bl[1] + thickMm],
        ],
      ],
      close: true,
      stroke: ink,
      strokeMm: stroke.mm,
    },
  ];
  const texts: PdfText[] = [
    {
      x: bl[0] + barLenMm + paperMillimetresFromGround(sideM * 0.012, sideM, layout.frameMm),
      y: bl[1] + thickMm * 0.82,
      sizeMm: (sideM * 0.02 * 1000) / layout.scale,
      text: `${barMetres} m`,
      color: ink,
    },
  ];
  return { name: "Scale bar", paths, texts };
}

export function planFrameAnnotationInk(): Rgb {
  return hexRgb(getColour("--sun-compass-label"));
}

export function planFrameAnnotationPaper(): Rgb {
  return hexRgb(getColour("--sheet-fill"));
}

export function planFrameAnnotationChunks(layout: SheetLayout, sideM: number): PdfChunk[] {
  const style = readDrawingStyle();
  const ink = planFrameAnnotationInk();
  const paper = planFrameAnnotationPaper();
  const input = { sideM, layout, ink, paper, stroke: { ...style.annotation, mm: Math.max(style.annotation.mm, 0.13) } };
  return [planNorthArrowChunk(input), planScaleBarChunk(input)];
}
