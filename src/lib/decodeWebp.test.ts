import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { init } from "@jsquash/webp/decode";
import { decodeTerrariumWebp } from "./decodeWebp";
import { clampHeightOutliers } from "./terrain";

const require = createRequire(import.meta.url);

/**
 * Mapterhorn z14 tile 14789/10053, covering Flagstaff Gardens and the Melbourne
 * CBD. The checksum is the sum of elevations in 1/256 m units from libwebp
 * `dwebp`, which is a direct decode of the lossless WebP.
 */
const TILE_UNITS = 1_149_224_704;
const TILE_PIXELS: { x: number; y: number; metres: number }[] = [
  { x: 0, y: 0, metres: 35.375 },
  { x: 511, y: 0, metres: 43.25 },
  { x: 0, y: 511, metres: 2.5 },
  { x: 256, y: 256, metres: 9.75 },
  { x: 346, y: 468, metres: -71 },
  { x: 100, y: 200, metres: 26.125 },
  { x: 400, y: 100, metres: 29.125 },
];

function tileBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

beforeAll(async () => {
  const wasmPath = require.resolve("@jsquash/webp/codec/dec/webp_dec.wasm");
  const wasmBinary = await readFile(wasmPath);
  await init({ wasmBinary } as unknown as Parameters<typeof init>[0]);
});

describe("webp terrain decode", () => {
  it("matches the reference tile without canvas readback", async () => {
    const path = fileURLToPath(new URL("./fixtures/mapterhorn-z14-14789-10053.webp", import.meta.url));
    const decoded = await decodeTerrariumWebp(tileBytes(await readFile(path)));
    expect(decoded.width).toBe(512);
    expect(decoded.height).toBe(512);
    for (const pixel of TILE_PIXELS) {
      expect(decoded.heights[pixel.y * 512 + pixel.x]).toBeCloseTo(pixel.metres, 5);
    }
    let units = 0;
    for (const height of decoded.heights) units += Math.round(height * 256);
    expect(units).toBe(TILE_UNITS);

    const counts = clampHeightOutliers(decoded.heights, decoded.width, decoded.height);
    expect(counts.spikes).toBe(0);
    expect(counts.clamped).toBeGreaterThan(0);
    expect(decoded.heights[468 * 512 + 346]).toBe(-50);
    expect(decoded.heights[256 * 512 + 256]).toBeCloseTo(9.75, 5);
  });

  it("decodes the same tile twice, including when the calls overlap", async () => {
    const path = fileURLToPath(new URL("./fixtures/mapterhorn-z14-14789-10053.webp", import.meta.url));
    const bytes = tileBytes(await readFile(path));
    const first = await decodeTerrariumWebp(bytes.slice(0));
    const second = await decodeTerrariumWebp(bytes.slice(0));
    expect(second.heights[0]).toBeCloseTo(first.heights[0], 5);
    expect(second.heights[256 * 512 + 256]).toBeCloseTo(9.75, 5);
    const parallel = await Promise.all([
      decodeTerrariumWebp(bytes.slice(0)),
      decodeTerrariumWebp(bytes.slice(0)),
      decodeTerrariumWebp(bytes.slice(0)),
    ]);
    for (const decoded of parallel) {
      expect(decoded.heights[0]).toBeCloseTo(35.375, 5);
      expect(decoded.heights[468 * 512 + 346]).toBeCloseTo(-71, 5);
    }
  });
});
