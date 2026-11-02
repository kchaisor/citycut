export function hoverHighlightYellowScore(r: number, g: number, b: number): number {
  return r + g - b * 2;
}

export function isHoverHighlightAccentYellow(r: number, g: number, b: number): boolean {
  const score = hoverHighlightYellowScore(r, g, b);
  return score >= 260 && r >= 150 && g >= 140 && b <= 120;
}

export function readCanvasPixelAtClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { r: number; g: number; b: number } | null {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return null;
  const rect = canvas.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }
  const dpr = window.devicePixelRatio || 1;
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((clientX - rect.left) * dpr)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((rect.bottom - clientY) * dpr)));
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return { r: pixel[0]!, g: pixel[1]!, b: pixel[2]! };
}

export function countAccentYellowNearClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  radiusPx: number,
): number {
  let count = 0;
  for (let dy = -radiusPx; dy <= radiusPx; dy += 4) {
    for (let dx = -radiusPx; dx <= radiusPx; dx += 4) {
      const sample = readCanvasPixelAtClient(canvas, clientX + dx, clientY + dy);
      if (sample && isHoverHighlightAccentYellow(sample.r, sample.g, sample.b)) count += 1;
    }
  }
  return count;
}

export function maxYellowScoreNearClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  radiusPx: number,
): number {
  let maxScore = 0;
  for (let dy = -radiusPx; dy <= radiusPx; dy += 4) {
    for (let dx = -radiusPx; dx <= radiusPx; dx += 4) {
      const sample = readCanvasPixelAtClient(canvas, clientX + dx, clientY + dy);
      if (!sample) continue;
      maxScore = Math.max(maxScore, hoverHighlightYellowScore(sample.r, sample.g, sample.b));
    }
  }
  return maxScore;
}
