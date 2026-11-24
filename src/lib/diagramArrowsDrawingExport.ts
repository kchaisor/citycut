import type { PdfChunk, PdfPath, PdfText } from "./aiDocument";
import { getColour } from "./colours";
import { ARROW_COLOUR_TOKENS, arrowLabelAnchor, buildArrowShape, ribbonPolygon, visibleInDrawing, type DiagramArrow } from "./diagramArrows";
import { LANDMARK_FONT_PX, LANDMARK_HALO_PX } from "./landmarkLabels";
import { hexRgb } from "./lineweights";

export const DIAGRAM_ARROWS_LAYER = "Diagram arrows";

const MM_PER_CSS_PX = 25.4 / 96;
const LABEL_LIFT_EM = 1.1;

export type ArrowSheetPoint = (east: number, north: number) => [number, number];

export function diagramArrowsChunk(
  arrows: readonly DiagramArrow[] | null | undefined,
  sideM: number,
  toSheet: ArrowSheetPoint,
): PdfChunk | null {
  const shown = visibleInDrawing(arrows ?? []);
  if (shown.length === 0) return null;
  const sizeMm = LANDMARK_FONT_PX * MM_PER_CSS_PX;
  const ink = hexRgb(getColour("--landmark-label"));
  const halo = { color: hexRgb(getColour("--landmark-label-halo")), widthMm: LANDMARK_HALO_PX * MM_PER_CSS_PX };
  const paths: PdfPath[] = [];
  const texts: PdfText[] = [];
  for (const arrow of shown) {
    const fill = hexRgb(getColour(ARROW_COLOUR_TOKENS[arrow.colour]));
    const shape = buildArrowShape(arrow.points, arrow.style, arrow.width, sideM);
    for (const polygon of [...shape.ribbons.map(ribbonPolygon), ...shape.heads]) {
      paths.push({ rings: [polygon.map(([east, north]) => toSheet(east, north))], close: true, fill, evenOdd: false });
    }
    const label = arrow.label.trim();
    if (label === "") continue;
    const [east, north] = arrowLabelAnchor(arrow.points);
    const [x, y] = toSheet(east, north);
    texts.push({ x, y: y + sizeMm * LABEL_LIFT_EM, sizeMm, text: label, color: ink, anchor: "middle", weight: 500, halo });
  }
  if (paths.length === 0 && texts.length === 0) return null;
  return { name: DIAGRAM_ARROWS_LAYER, paths, texts };
}
