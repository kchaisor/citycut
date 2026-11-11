import type { PdfChunk } from "../aiDocument";
import type { SheetLayout } from "../figureGround";
import { getColour } from "../colours";
import { hexRgb } from "../lineweights";
import type { CityModel } from "../../types";
import { sectionPlanMarkerGeometry } from "./marker";
import type { SectionKnifeToolState } from "./state";

function mapPoint(east: number, north: number, sideM: number, layout: SheetLayout): [number, number] {
  const half = sideM / 2;
  const x = layout.frameX + ((east + half) / sideM) * layout.frameMm;
  const yDown = layout.frameY + ((half - north) / sideM) * layout.frameMm;
  return [x, layout.pageHeightMm - yDown];
}

export function sectionMarkerPlanChunk(
  model: CityModel,
  layout: SheetLayout,
  tool: SectionKnifeToolState | null | undefined,
): PdfChunk | null {
  if (!tool?.active || tool.knives.length === 0) return null;
  const stroke = hexRgb(getColour("--section-knife-marker-gold"));
  const paths: PdfChunk["paths"] = [];
  for (const knife of tool.knives) {
    const geom = sectionPlanMarkerGeometry(model, knife.pose);
    const p0 = mapPoint(geom.east0, geom.north0, model.sideM, layout);
    const p1 = mapPoint(geom.east1, geom.north1, model.sideM, layout);
    const selected = knife.id === tool.selectedId;
    paths.push({
      rings: [[p0, p1]],
      close: false,
      stroke,
      strokeMm: selected ? 0.35 : 0.22,
      dashMm: [2.4, 0.55],
      cap: "butt",
      join: "miter",
      opacity: selected ? 1 : 0.72,
    });
  }
  if (paths.length === 0) return null;
  return { name: "Section markers", paths };
}
