export const LBM_Q = 9;

export const LBM_W = new Float64Array([4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36]);

export const LBM_CX = new Int8Array([0, 1, 0, -1, 0, 1, -1, -1, 1]);
export const LBM_CY = new Int8Array([0, 0, 1, 0, -1, 1, 1, -1, -1]);

export const LBM_OPP = new Uint8Array([0, 3, 4, 1, 2, 7, 8, 5, 6]);

export function pickWindGridLongSide(sideM: number): number {
  if (sideM <= 120) return 256;
  if (sideM <= 280) return 384;
  return 512;
}
