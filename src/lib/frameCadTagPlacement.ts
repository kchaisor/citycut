export type LayoutRect = { left: number; top: number; width: number; height: number };

export const FRAME_CAD_BELOW_GAP_PX = 14;
export const FRAME_CAD_INSET_PX = 8;
export const FRAME_CAD_DOCK_GAP_PX = 8;

export type FrameCadTagPlacement = {
  centerX: number;
  top: number;
  mode: "below" | "inside-bottom" | "above";
};

export function frameCadTagCenterX(frame: LayoutRect, viewportWidth: number): number {
  return Math.min(Math.max(frame.left + frame.width / 2, 88), viewportWidth - 150);
}

function chipBottomClearsDock(top: number, chip: Pick<LayoutRect, "height">, dock: LayoutRect): boolean {
  return top + chip.height <= dock.top - FRAME_CAD_DOCK_GAP_PX;
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

  if (dock == null || (!nearDock && chipBottomClearsDock(belowTop, chip, dock))) {
    return { centerX, top: belowTop, mode: "below" };
  }

  const insideBottomTop = frame.top + frame.height - chip.height - FRAME_CAD_INSET_PX;
  const insideFitsInFrame = insideBottomTop >= frame.top + FRAME_CAD_INSET_PX;
  if (insideFitsInFrame && chipBottomClearsDock(insideBottomTop, chip, dock)) {
    return { centerX, top: insideBottomTop, mode: "inside-bottom" };
  }

  const aboveTop = Math.max(FRAME_CAD_INSET_PX, frame.top - chip.height - FRAME_CAD_BELOW_GAP_PX);
  if (chipBottomClearsDock(aboveTop, chip, dock)) {
    return { centerX, top: aboveTop, mode: "above" };
  }

  const pinnedTop = dock.top - FRAME_CAD_DOCK_GAP_PX - chip.height;
  return { centerX, top: Math.max(FRAME_CAD_INSET_PX, pinnedTop), mode: "above" };
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
