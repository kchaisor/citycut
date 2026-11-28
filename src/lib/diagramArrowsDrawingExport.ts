import type { PdfChunk, PdfPath } from "./aiDocument";
import { getColour } from "./colours";
import { ARROW_COLOUR_TOKENS, visibleInDrawing, type DiagramArrow } from "./diagramArrows";
import { buildArrowShape, shapeFills } from "./diagramArrowsShape";
import { hexRgb } from "./lineweights";

export const DIAGRAM_ARROWS_LAYER = "Diagram arrows";

const EXPORT_BANDS = 8;

export type ArrowSheetPoint = (east: number, north: number) => [number, number];

export function diagramArrowsChunk(
  arrows: readonly DiagramArrow[] | null | undefined,
  sideM: number,
  toSheet: ArrowSheetPoint,
): PdfChunk | null {
  const paths: PdfPath[] = [];
  for (const arrow of visibleInDrawing(arrows ?? [])) {
    const fill = hexRgb(getColour(ARROW_COLOUR_TOKENS[arrow.colour]));
    const shape = buildArrowShape(arrow.points, arrow.style, arrow.width, sideM);
    for (const { polygon, alpha } of shapeFills(shape, EXPORT_BANDS)) {
      const path: PdfPath = { rings: [polygon.map(([east, north]) => toSheet(east, north))], close: true, fill, evenOdd: false };
      paths.push(alpha < 1 ? { ...path, opacity: alpha } : path);
    }
  }
  return paths.length === 0 ? null : { name: DIAGRAM_ARROWS_LAYER, paths, texts: [] };
}
