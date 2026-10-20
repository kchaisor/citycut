import type { PdfChunk, PdfPath } from "./aiDocument";
import { getColour } from "./colours";
import { dashSegments, type StrokeStyle } from "./drawingStyle";
import type { SheetLayout } from "./figureGround";
import { openRing } from "./geo";
import { hexRgb } from "./lineweights";
import { nswPlanItems } from "./nswPlan";
import { readNswPlanStyle } from "./nswPlanStyle";
import type { CityModel, Pt } from "../types";

/** Illustrator/PDF layers for NSW mode. Empty for Victorian cuts (no model.nsw). */
export const NSW_SITE_LAYERS = [
  "NSW zoning",
  "NSW road corridors",
  "NSW lots",
  "NSW heritage",
  "NSW easements",
  "NSW centrelines",
  "NSW planning labels",
] as const;

function sheetPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

function pen(style: StrokeStyle): Partial<PdfPath> | null {
  if (!(style.mm > 0)) return null;
  const dash = dashSegments(style.dash);
  return { stroke: hexRgb(style.color), strokeMm: style.mm, ...(dash ? { dashMm: dash } : {}), cap: "butt", join: "miter" };
}

/** Printed planning label size. */
export const NSW_LABEL_MM = 1.6;

export function nswPlanChunks(
  model: CityModel,
  layout: SheetLayout,
): { under: PdfChunk[]; lines: PdfChunk[]; labels: PdfChunk[] } {
  const empty = { under: [], lines: [], labels: [] };
  if (!model.nsw) return empty;
  const style = readNswPlanStyle();
  // Labels are thinned at their printed size (NSW_LABEL_MM on paper, in metres on the ground).
  const items = nswPlanItems(model, style.hatchM, (NSW_LABEL_MM * layout.scale) / 1000);
  if (!items) return empty;
  const side = model.sideM;
  const ring = (r: Pt[]) => openRing(r).map((p) => sheetPoint(p[0], p[1], side, layout));
  const polygon = (rings: Pt[][]) => rings.map(ring).filter((r) => r.length >= 3);
  const sheet = hexRgb(getColour("--sheet-fill"));
  const tint = (hex: string, opacity: number) => {
    const c = hexRgb(hex);
    return [0, 1, 2].map((i) => c[i]! * opacity + sheet[i]! * (1 - opacity)) as [number, number, number];
  };
  const under: PdfChunk[] = [];
  if (items.zoning.length > 0) {
    under.push({
      name: "NSW zoning",
      paths: items.zoning.map((zone) => ({ rings: polygon(zone.rings), fill: tint(getColour(zone.colour), style.zoningOpacity), evenOdd: true, close: true })),
    });
  }
  if (items.corridors.length > 0) {
    under.push({
      name: "NSW road corridors",
      paths: items.corridors.map((rings) => ({ rings: polygon(rings), fill: hexRgb(style.corridorFill), evenOdd: true, close: true })),
    });
  }
  const lines: PdfChunk[] = [];
  const lotPen = pen(style.lot);
  if (items.lots.length > 0 && lotPen) {
    lines.push({ name: "NSW lots", paths: items.lots.map((rings) => ({ rings: polygon(rings), close: true, ...lotPen })) });
  }
  const segment = ([a, b]: [Pt, Pt]) => [sheetPoint(a[0], a[1], side, layout), sheetPoint(b[0], b[1], side, layout)];
  const heritagePen = pen(style.heritage);
  const heritageHatch = pen({ ...style.heritage, mm: style.heritage.mm * 0.6, dash: "none" });
  if (items.heritage.length > 0 && heritagePen) {
    lines.push({
      name: "NSW heritage",
      paths: [
        ...items.heritageHatch.map((s) => ({ rings: [segment(s)], close: false, ...(heritageHatch ?? heritagePen) })),
        ...items.heritage.map((rings) => ({ rings: polygon(rings), close: true, ...heritagePen })),
      ],
    });
  }
  const easementPen = pen(style.easement);
  const easementHatch = pen({ ...style.easement, mm: style.easement.mm * 0.6, dash: "none" });
  if (items.easements.length > 0 && easementPen) {
    lines.push({
      name: "NSW easements",
      paths: [
        ...items.easementHatch.map((s) => ({ rings: [segment(s)], close: false, ...(easementHatch ?? easementPen) })),
        ...items.easements.map((rings) => ({ rings: polygon(rings), close: true, ...easementPen })),
      ],
    });
  }
  const centrePen = pen(style.centreline);
  if (items.centrelines.length > 0 && centrePen) {
    lines.push({
      name: "NSW centrelines",
      paths: items.centrelines.map((line) => ({ rings: [line.map((p) => sheetPoint(p[0], p[1], side, layout))], close: false, ...centrePen })),
    });
  }
  const sizeMm = NSW_LABEL_MM;
  const colour = { zone: style.zoneLabel, hob: style.hobLabel, fsr: style.fsrLabel } as const;
  const labels: PdfChunk[] =
    items.labels.length > 0
      ? [
          {
            name: "NSW planning labels",
            texts: items.labels.map((label) => {
              const [x, y] = sheetPoint(label.at[0], label.at[1], side, layout);
              return {
                x: x - label.text.length * sizeMm * 0.27,
                y: y - sizeMm * 0.35,
                sizeMm,
                text: label.text,
                color: hexRgb(colour[label.kind]),
              };
            }),
          },
        ]
      : [];
  return { under, lines, labels };
}
