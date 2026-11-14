export type InspectHudPlacement = { left: number; top: number };

export const INSPECT_HUD_DEFAULT_WIDTH = 280;
export const INSPECT_HUD_DEFAULT_HEIGHT = 320;
const MARGIN = 12;
const PICK_OFFSET = 18;
const COMPASS_SAFE_W = 80;
const COMPASS_SAFE_H = 148;
const STUDIO_RIGHT_PANEL_W = 320;

export type ClampInspectHudInput = {
  anchorX: number;
  anchorY: number;
  viewportWidth: number;
  viewportHeight: number;
  hudWidth?: number;
  hudHeight?: number;
};

export type ViewportSize = { width: number; height: number };

export function inspectHudAnchor(anchorX: number, anchorY: number, viewport: ViewportSize): { x: number; y: number } {
  const hudW = INSPECT_HUD_DEFAULT_WIDTH;
  const hudH = INSPECT_HUD_DEFAULT_HEIGHT;
  let x = anchorX + PICK_OFFSET;
  let y = anchorY + PICK_OFFSET;
  x = Math.min(Math.max(MARGIN, x), viewport.width - hudW - MARGIN);
  y = Math.min(Math.max(MARGIN, y), viewport.height - hudH - MARGIN);
  return { x, y };
}

export function inspectHudAvoidCompass(
  anchor: { x: number; y: number },
  viewport: ViewportSize,
): { x: number; y: number } {
  const hudW = INSPECT_HUD_DEFAULT_WIDTH;
  const hudH = INSPECT_HUD_DEFAULT_HEIGHT;
  const compassLeft = viewport.width - STUDIO_RIGHT_PANEL_W - COMPASS_SAFE_W;
  const compassTop = viewport.height - COMPASS_SAFE_H;
  let { x, y } = anchor;
  if (x + hudW > compassLeft - 8 && y + hudH > compassTop - 8) {
    x = Math.min(x, compassLeft - hudW - MARGIN);
    y = Math.min(y, compassTop - hudH - MARGIN);
  }
  return { x, y };
}

export function clampInspectHudPosition(input: ClampInspectHudInput): InspectHudPlacement {
  const viewport = { width: input.viewportWidth, height: input.viewportHeight };
  const anchored = inspectHudAnchor(input.anchorX, input.anchorY, viewport);
  const placed = inspectHudAvoidCompass(anchored, viewport);
  return { left: placed.x, top: placed.y };
}

export function inspectHudInViewport(
  anchorX: number,
  anchorY: number,
  viewportWidth: number,
  viewportHeight: number,
  pad = 4,
): boolean {
  return anchorX >= pad && anchorY >= pad && anchorX <= viewportWidth - pad && anchorY <= viewportHeight - pad;
}
