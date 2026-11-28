import { getColour } from "./colours";
import {
  LANDMARK_FONT_PX,
  LANDMARK_HALO_PX,
  LANDMARK_LABEL_GAP_PX,
  estimateTextWidth,
  placeLandmarkLabels,
} from "./landmarkLabels";

let measureContext: CanvasRenderingContext2D | null | undefined;

export function landmarkLabelFont(fontPx = LANDMARK_FONT_PX): string {
  const family =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() : "";
  return `500 ${fontPx}px ${family || "sans-serif"}`;
}

export function measureLabelText(text: string, fontPx = LANDMARK_FONT_PX): number {
  if (measureContext === undefined) {
    measureContext = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  if (!measureContext) return estimateTextWidth(text, fontPx);
  measureContext.font = landmarkLabelFont(fontPx);
  return measureContext.measureText(text).width;
}

export type CanvasLandmarkLabel = { buildingId: number; name: string; rank: number; x: number; y: number };

export function drawLandmarkLabels(
  context: CanvasRenderingContext2D,
  labels: readonly CanvasLandmarkLabel[],
  cssWidth: number,
  cssHeight: number,
  scale: number,
): number {
  const candidates = labels.map((label) => ({
    ...label,
    id: label.buildingId,
    width: measureLabelText(label.name) + LANDMARK_HALO_PX * 2,
    height: LANDMARK_FONT_PX * 1.3 + LANDMARK_HALO_PX * 2,
  }));
  const placed = placeLandmarkLabels(candidates, [], {
    labelGap: LANDMARK_LABEL_GAP_PX,
    obstacleGap: 0,
    bounds: { left: 0, top: 0, right: cssWidth, bottom: cssHeight },
  });
  context.save();
  context.font = landmarkLabelFont(LANDMARK_FONT_PX * scale);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = LANDMARK_HALO_PX * 2 * scale;
  context.strokeStyle = getColour("--landmark-label-halo");
  context.fillStyle = getColour("--landmark-label");
  for (const label of placed) {
    context.strokeText(label.name, label.x * scale, label.y * scale);
    context.fillText(label.name, label.x * scale, label.y * scale);
  }
  context.restore();
  return placed.length;
}
