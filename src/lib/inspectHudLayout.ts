export type InspectHudPlacement = { left: number; top: number };

export const INSPECT_HUD_DEFAULT_WIDTH = 280;
export const INSPECT_HUD_DEFAULT_HEIGHT = 320;
export const INSPECT_HUD_MARGIN = 16;
export const INSPECT_HUD_OFFSET = 8;
const COMPASS_SAFE_W = 88;
const COMPASS_SAFE_H = 88;

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
  let x = anchorX + INSPECT_HUD_OFFSET;
  let y = anchorY + INSPECT_HUD_OFFSET;
  x = Math.min(Math.max(INSPECT_HUD_MARGIN, x), viewport.width - hudW - INSPECT_HUD_MARGIN);
  y = Math.min(Math.max(INSPECT_HUD_MARGIN, y), viewport.height - hudH - INSPECT_HUD_MARGIN);
  return { x, y };
}

export function inspectHudAvoidCompass(
  anchor: { x: number; y: number },
  viewport: ViewportSize,
): { x: number; y: number } {
  const hudW = INSPECT_HUD_DEFAULT_WIDTH;
  const hudH = INSPECT_HUD_DEFAULT_HEIGHT;
  const compassLeft = viewport.width - COMPASS_SAFE_W;
  const compassTop = viewport.height - COMPASS_SAFE_H;
  let { x, y } = anchor;
  if (x + hudW > compassLeft - 8 && y + hudH > compassTop - 8) {
    x = Math.min(x, compassLeft - hudW - INSPECT_HUD_MARGIN);
    y = Math.min(y, compassTop - hudH - INSPECT_HUD_MARGIN);
  }
  return { x, y };
}

export function clampInspectHudPosition(input: ClampInspectHudInput): InspectHudPlacement {
  const viewport = { width: input.viewportWidth, height: input.viewportHeight };
  const anchored = inspectHudAnchor(input.anchorX, input.anchorY, viewport);
  const placed = inspectHudAvoidCompass(anchored, viewport);
  return { left: placed.x, top: placed.y };
}

export type InspectHudScreenPoint = { clientX: number; clientY: number };

export function inspectHudPlacement(
  screen: (InspectHudScreenPoint & { inView: boolean }) | null,
  lastPick: InspectHudScreenPoint | null,
  viewport: ViewportSize,
): InspectHudPlacement | null {
  if (!screen) return null;
  const anchor = screen.inView || !lastPick ? screen : lastPick;
  return clampInspectHudPosition({
    anchorX: Number.isFinite(anchor.clientX) ? anchor.clientX : 0,
    anchorY: Number.isFinite(anchor.clientY) ? anchor.clientY : 0,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
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
