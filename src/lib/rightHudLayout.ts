export const RIGHT_HUD_TOP_PX = 68;
export const RIGHT_HUD_RIGHT_PX = 14;
export const RIGHT_HUD_WIDTH_PX = 304;
export const RIGHT_HUD_GAP_PX = 12;
export const HUD_CLEARANCE_PX = 8;
export const ENV_CONSOLE_EDGE_PX = 16;

export type HudBox = { left: number; right: number; top: number; bottom: number };

function overlapsX(a: HudBox, b: HudBox, pad: number): boolean {
  return a.left < b.right + pad && a.right > b.left - pad;
}

function overlapsY(a: HudBox, b: HudBox, pad: number): boolean {
  return a.top < b.bottom + pad && a.bottom > b.top - pad;
}

function sized(box: HudBox | null): box is HudBox {
  return box != null && box.right > box.left && box.bottom > box.top;
}

export function rightHudMaxHeight(viewportHeight: number, stack: HudBox, below: readonly (HudBox | null)[]): number {
  let floor = viewportHeight - HUD_CLEARANCE_PX;
  for (const box of below) {
    if (!sized(box) || box.top <= stack.top || !overlapsX(box, stack, HUD_CLEARANCE_PX)) continue;
    floor = Math.min(floor, box.top - HUD_CLEARANCE_PX);
  }
  return Math.max(0, Math.floor(floor - stack.top));
}

export function envConsoleLanes(
  viewportWidth: number,
  consoleBox: HudBox,
  leftObstacles: readonly (HudBox | null)[],
  rightStack: HudBox | null,
): { left: number; right: number } {
  let left = ENV_CONSOLE_EDGE_PX;
  for (const box of leftObstacles) {
    if (!sized(box) || !overlapsY(box, consoleBox, HUD_CLEARANCE_PX)) continue;
    left = Math.max(left, Math.ceil(box.right + HUD_CLEARANCE_PX));
  }
  const right = sized(rightStack)
    ? Math.max(ENV_CONSOLE_EDGE_PX, Math.ceil(viewportWidth - rightStack.left + HUD_CLEARANCE_PX))
    : ENV_CONSOLE_EDGE_PX;
  return { left, right };
}
