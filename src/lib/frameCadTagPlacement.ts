export type LayoutRect = { left: number; top: number; width: number; height: number };

export const FRAME_CAD_BELOW_GAP_PX = 14;
export const FRAME_CAD_INSET_PX = 8;
export const FRAME_CAD_DOCK_GAP_PX = 8;

export type FrameCadTagPlacement = {
  centerX: number;
  top: number;
  mode: "below" | "inside-bottom" | "above";
};

function rectsIntersect(a: LayoutRect, b: LayoutRect): boolean {
  return !(
    a.left + a.width <= b.left ||
    a.left >= b.left + b.width ||
    a.top + a.height <= b.top ||
    a.top >= b.top + b.height
  );
}

function chipRect(centerX: number, top: number, chip: LayoutRect): LayoutRect {
  return { left: centerX - chip.width / 2, top, width: chip.width, height: chip.height };
}

export function frameCadTagCenterX(frame: LayoutRect, viewportWidth: number): number {
  return Math.min(Math.max(frame.left + frame.width / 2, 88), viewportWidth - 150);
}

export function frameCadTagPlacement(
  frame: LayoutRect,
  dock: LayoutRect | null,
  chip: Pick<LayoutRect, "width" | "height">,
  viewportWidth: number,
): FrameCadTagPlacement {
  const centerX = frameCadTagCenterX(frame, viewportWidth);
  const belowTop = frame.top + frame.height + FRAME_CAD_BELOW_GAP_PX;
  const nearDock = dock != null && frame.top + frame.height >= dock.top - FRAME_CAD_DOCK_GAP_PX;
  const belowHitsDock = dock != null && rectsIntersect(chipRect(centerX, belowTop, chip as LayoutRect), dock);

  if (!nearDock && !belowHitsDock) {
    return { centerX, top: belowTop, mode: "below" };
  }

  const insideBottomTop = frame.top + frame.height - chip.height - FRAME_CAD_INSET_PX;
  const insideFitsInFrame = insideBottomTop >= frame.top + FRAME_CAD_INSET_PX;
  const insideClear =
    dock == null ||
    !rectsIntersect(chipRect(centerX, insideBottomTop, chip as LayoutRect), dock);

  if (insideFitsInFrame && insideClear) {
    return { centerX, top: insideBottomTop, mode: "inside-bottom" };
  }

  const aboveTop = Math.max(FRAME_CAD_INSET_PX, frame.top - chip.height - FRAME_CAD_BELOW_GAP_PX);
  return { centerX, top: aboveTop, mode: "above" };
}

export function readLandingDockRect(mapWrap: HTMLElement): LayoutRect | null {
  const dock = mapWrap.ownerDocument.querySelector(".landing-workbench-dock");
  if (!dock) return null;
  const dockBox = dock.getBoundingClientRect();
  const wrapBox = mapWrap.getBoundingClientRect();
  return {
    left: dockBox.left - wrapBox.left,
    top: dockBox.top - wrapBox.top,
    width: dockBox.width,
    height: dockBox.height,
  };
}
