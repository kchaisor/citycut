import type { ViewStyle3dId } from "./view3dDisplay";

export const VIEW_STYLE_SEG_TRACK_PADDING_PX = 3;
export const VIEW_STYLE_SEG_GAP_PX = 2;
export const VIEW_STYLE_SEG_HEIGHT_PX = 32;
export const VIEW_STYLE_SEG_FONT_SIZE_PX = 11;
export const VIEW_STYLE_SEG_FONT_WEIGHT = 500;
export const VIEW_STYLE_SEG_ACTIVE_FONT_WEIGHT = 600;
export const VIEW_STYLE_SEG_CELL_PADDING_X_PX = 8;

export const VIEW_STYLE_SEG_OPTIONS: readonly { id: ViewStyle3dId; label: string; name: string }[] = [
  { id: "primary", label: "Primary", name: "Primary" },
  { id: "use", label: "Use", name: "Use" },
  { id: "source", label: "Src", name: "Source" },
  { id: "uniform", label: "Card", name: "Card" },
  { id: "mono", label: "B&W", name: "Black and white" },
];

export const VIEW_STYLE_SEG_LABELS = VIEW_STYLE_SEG_OPTIONS.map((option) => option.label);
export const VIEW_STYLE_SEG_COLUMNS = VIEW_STYLE_SEG_OPTIONS.length;

export function viewStyleSegSlackPx(trackWidthPx: number, labelWidthsPx: readonly number[]): number {
  const inner = trackWidthPx - VIEW_STYLE_SEG_TRACK_PADDING_PX * 2;
  const gaps = VIEW_STYLE_SEG_GAP_PX * (labelWidthsPx.length - 1);
  const cells = labelWidthsPx.reduce((sum, width) => sum + width + VIEW_STYLE_SEG_CELL_PADDING_X_PX * 2, 0);
  return inner - gaps - cells;
}

export function measureViewStyleLabelWidth(label: string, weight: number): number {
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.visibility = "hidden";
  span.style.whiteSpace = "nowrap";
  span.style.fontFamily = "Geist, sans-serif";
  span.style.fontSize = `${VIEW_STYLE_SEG_FONT_SIZE_PX}px`;
  span.style.fontWeight = String(weight);
  span.textContent = label;
  document.body.appendChild(span);
  const width = span.offsetWidth;
  document.body.removeChild(span);
  return width;
}
