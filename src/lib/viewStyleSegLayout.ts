export const VIEW_STYLE_SEG_TRACK_PADDING_PX = 4;
export const VIEW_STYLE_SEG_GAP_PX = 4;
export const VIEW_STYLE_SEG_COLUMNS = 2;
export const VIEW_STYLE_SEG_CELL_PADDING_X_PX = 12;

export const VIEW_STYLE_SEG_LABELS = ["Primary", "Use", "Source", "White Card"] as const;

export function viewStyleSegCellWidth(trackWidthPx: number): number {
  const inner = trackWidthPx - VIEW_STYLE_SEG_TRACK_PADDING_PX * 2;
  const gaps = VIEW_STYLE_SEG_GAP_PX * (VIEW_STYLE_SEG_COLUMNS - 1);
  return (inner - gaps) / VIEW_STYLE_SEG_COLUMNS;
}

export function viewStyleSegLabelMaxWidth(trackWidthPx: number): number {
  return viewStyleSegCellWidth(trackWidthPx) - VIEW_STYLE_SEG_CELL_PADDING_X_PX * 2;
}

export function measureViewStyleLabelWidth(label: string, weight: number): number {
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.visibility = "hidden";
  span.style.whiteSpace = "nowrap";
  span.style.fontFamily = "Geist, sans-serif";
  span.style.fontSize = "10.5px";
  span.style.fontWeight = String(weight);
  span.textContent = label;
  document.body.appendChild(span);
  const width = span.offsetWidth;
  document.body.removeChild(span);
  return width;
}
