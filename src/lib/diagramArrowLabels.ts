import { getColour } from "./colours";
import { LANDMARK_FONT_PX } from "./landmarkLabels";
import { landmarkLabelFont, measureLabelText } from "./landmarkLabelText";

export type CanvasArrowLabel = { text: string; x: number; y: number };

const PAD_X_PX = 6;
const HEIGHT_PX = 20;
const RADIUS_PX = 4;

export function drawArrowLabels(context: CanvasRenderingContext2D, labels: readonly CanvasArrowLabel[], scale: number): void {
  if (labels.length === 0) return;
  context.save();
  context.font = landmarkLabelFont(LANDMARK_FONT_PX * scale);
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const label of labels) {
    const width = (measureLabelText(label.text) + PAD_X_PX * 2) * scale;
    const height = HEIGHT_PX * scale;
    context.beginPath();
    context.roundRect(label.x * scale - width / 2, label.y * scale - height / 2, width, height, RADIUS_PX * scale);
    context.fillStyle = getColour("--landmark-label-halo");
    context.fill();
    context.fillStyle = getColour("--landmark-label");
    context.fillText(label.text, label.x * scale, label.y * scale);
  }
  context.restore();
}
