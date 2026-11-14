export const GROUND_WIND_HUD_MASK_SELECTORS = [".right-inspector.hud-card", ".bottom-bar.hud-card"] as const;

export type GroundWindMaskRect = { x0: number; y0: number; x1: number; y1: number };

export type GroundWindHudMask = {
  right: GroundWindMaskRect;
  bottom: GroundWindMaskRect;
};

export const GROUND_WIND_EMPTY_MASK_RECT: GroundWindMaskRect = { x0: 1, y0: 1, x1: 0, y1: 0 };

type RectLike = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export function groundWindMaskRectFromClient(rect: RectLike | null, canvas: RectLike): GroundWindMaskRect {
  if (!rect || rect.width <= 0 || rect.height <= 0) return GROUND_WIND_EMPTY_MASK_RECT;
  const x0 = Math.max(0, rect.left - canvas.left);
  const y0 = Math.max(0, rect.top - canvas.top);
  const x1 = Math.min(canvas.width, rect.right - canvas.left);
  const y1 = Math.min(canvas.height, rect.bottom - canvas.top);
  if (x1 <= x0 || y1 <= y0) return GROUND_WIND_EMPTY_MASK_RECT;
  return { x0, y0, x1, y1 };
}

export function groundWindHudMaskFromDom(canvas: Element | null): GroundWindHudMask {
  if (!canvas || typeof document === "undefined") {
    return { right: GROUND_WIND_EMPTY_MASK_RECT, bottom: GROUND_WIND_EMPTY_MASK_RECT };
  }
  const canvasRect = canvas.getBoundingClientRect();
  const [rightSel, bottomSel] = GROUND_WIND_HUD_MASK_SELECTORS;
  const rect = (selector: string) => {
    const el = document.querySelector(selector);
    return el ? el.getBoundingClientRect() : null;
  };
  return {
    right: groundWindMaskRectFromClient(rect(rightSel), canvasRect),
    bottom: groundWindMaskRectFromClient(rect(bottomSel), canvasRect),
  };
}

export function groundWindMaskedAt(mask: GroundWindHudMask, x: number, y: number): boolean {
  const inside = (r: GroundWindMaskRect) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  return inside(mask.right) || inside(mask.bottom);
}
