export const GROUND_WIND_MASK_REF_W = 1440;
export const GROUND_WIND_MASK_REF_H = 900;

export type GroundWindHudMask = {
  rightMin: [number, number];
  rightMax: [number, number];
  bottomMin: [number, number];
  bottomMax: [number, number];
};

export function groundWindHudMask(viewW: number, viewH: number): GroundWindHudMask {
  const sx = viewW / GROUND_WIND_MASK_REF_W;
  const sy = viewH / GROUND_WIND_MASK_REF_H;
  return {
    rightMin: [1158 * sx, 68 * sy],
    rightMax: [viewW, viewH],
    bottomMin: [336 * sx, 808 * sy],
    bottomMax: [1104 * sx, viewH],
  };
}
