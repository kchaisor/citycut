export type Rect = { left: number; top: number; right: number; bottom: number };
export type MapPadding = { left: number; top: number; right: number; bottom: number };

/**
 * Map padding that centres the camera (and so the cut frame) in the part of the landing map
 * the floating controls leave visible. Desktop: the controls are a full-height column on the
 * left, so pad by how far their right edge reaches into the map. Phone: they sit along the
 * bottom, so pad by how far their top edge reaches up into the map (0 when the map already
 * stops above them).
 */
export function landingMapPadding(map: Rect, chrome: Rect | null): MapPadding {
  const padding = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!chrome) return padding;
  const width = map.right - map.left;
  const height = map.bottom - map.top;
  const fullHeight = chrome.top <= map.top + 1 && chrome.bottom >= map.bottom - 1;
  if (fullHeight && chrome.left <= map.left + 1) {
    padding.left = clamp(chrome.right - map.left, width);
  } else if (chrome.bottom >= map.bottom - 1 && chrome.left <= map.left + 1 && chrome.right >= map.right - 1) {
    padding.bottom = clamp(map.bottom - chrome.top, height);
  }
  return padding;
}

/** Never pad away more than 80 % of the map, so the frame always has room. */
function clamp(value: number, size: number): number {
  return Math.round(Math.max(0, Math.min(value, size * 0.8)));
}
