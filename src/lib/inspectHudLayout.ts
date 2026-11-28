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

export type InspectHudBox = { left: number; top: number; right: number; bottom: number };

export type InspectHudDockInput = {
  viewport: ViewportSize;
  above?: InspectHudBox[];
  beside?: InspectHudBox[];
  hudWidth?: number;
};

export function inspectHudDock(input: InspectHudDockInput): InspectHudPlacement {
  const { viewport } = input;
  const hudW = Math.min(input.hudWidth ?? INSPECT_HUD_DEFAULT_WIDTH, viewport.width - 2 * INSPECT_HUD_MARGIN);
  let right = viewport.width - INSPECT_HUD_MARGIN;
  for (const box of input.beside ?? []) {
    if (box.left - INSPECT_HUD_MARGIN - hudW < INSPECT_HUD_MARGIN) continue;
    right = Math.min(right, box.left - INSPECT_HUD_MARGIN);
  }
  const left = Math.max(INSPECT_HUD_MARGIN, right - hudW);
  let top = INSPECT_HUD_MARGIN;
  for (const box of input.above ?? []) {
    if (box.right <= left - INSPECT_HUD_MARGIN || box.left >= left + hudW + INSPECT_HUD_MARGIN) continue;
    if (box.bottom > viewport.height / 2) continue;
    top = Math.max(top, box.bottom + INSPECT_HUD_MARGIN);
  }
  return { left, top };
}

export const INSPECT_HUD_DOCK_ABOVE = [".model .top-bar-center", ".model .top-bar-right", ".model .studio-compass"].join(", ");
export const INSPECT_HUD_DOCK_BESIDE = ".model .right-hud-stack";

function visibleBoxes(selector: string): InspectHudBox[] {
  const boxes: InspectHudBox[] = [];
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  }
  return boxes;
}

export function measureInspectHudDock(): InspectHudPlacement {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return inspectHudDock({ viewport: { width: 1440, height: 900 } });
  }
  return inspectHudDock({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    above: visibleBoxes(INSPECT_HUD_DOCK_ABOVE),
    beside: visibleBoxes(INSPECT_HUD_DOCK_BESIDE),
  });
}
