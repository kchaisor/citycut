export const RIGHT_HUD_TOP_PX = 68;
export const RIGHT_HUD_RIGHT_PX = 14;
export const RIGHT_HUD_WIDTH_PX = 304;
export const RIGHT_HUD_GAP_PX = 12;
export const HUD_GUTTER_PX = 16;
export const HUD_ISLAND_GAP_PX = 8;
export const ENV_CONSOLE_EDGE_PX = 16;
export const ENV_CONSOLE_MAX_PREFERRED_PX = 720;

export type HudBox = { left: number; right: number; top: number; bottom: number };
export type EnvConsoleLanes = { left: number; right: number };

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
  let floor = viewportHeight - HUD_GUTTER_PX;
  for (const box of below) {
    if (!sized(box) || box.top <= stack.top || !overlapsX(box, stack, 0)) continue;
    floor = Math.min(floor, box.top - HUD_GUTTER_PX);
  }
  return Math.max(0, Math.floor(floor - stack.top));
}

export function envConsoleLanes(
  viewportWidth: number,
  consoleBox: HudBox,
  leftObstacles: readonly (HudBox | null)[],
  rightStack: HudBox | null,
): EnvConsoleLanes {
  let left = ENV_CONSOLE_EDGE_PX;
  for (const box of leftObstacles) {
    if (!sized(box) || !overlapsY(box, consoleBox, HUD_GUTTER_PX)) continue;
    left = Math.max(left, Math.ceil(box.right + HUD_GUTTER_PX));
  }
  const right = sized(rightStack)
    ? Math.max(ENV_CONSOLE_EDGE_PX, Math.ceil(viewportWidth - rightStack.left + HUD_GUTTER_PX))
    : ENV_CONSOLE_EDGE_PX;
  return { left, right };
}

export function envConsoleMaxWidth(viewportWidth: number, lanes: EnvConsoleLanes): number {
  return Math.max(0, viewportWidth - lanes.left - lanes.right);
}

export function envConsoleBox(
  viewportWidth: number,
  lanes: EnvConsoleLanes,
  contentWidth: number,
  top: number,
  bottom: number,
): HudBox {
  const lane = envConsoleMaxWidth(viewportWidth, lanes);
  const width = Math.min(Math.max(contentWidth, Math.min(ENV_CONSOLE_MAX_PREFERRED_PX, lane)), lane);
  const centre = lanes.left + lane / 2;
  return { left: centre - width / 2, right: centre + width / 2, top, bottom };
}

export function transportLegendBottom(
  viewportHeight: number,
  obstacles: readonly (HudBox | null)[],
  gap: number = HUD_ISLAND_GAP_PX,
): number {
  let top = viewportHeight;
  for (const box of obstacles) {
    if (sized(box)) top = Math.min(top, box.top);
  }
  return Math.max(gap, Math.ceil(viewportHeight - top + gap));
}
