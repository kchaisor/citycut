import decode from "@jsquash/webp/decode";
import { decodeTerrarium } from "./terrain";

/**
 * Decode a Mapterhorn Terrarium WebP from the tile bytes.
 *
 * The pixels never pass through canvas `getImageData`. Firefox canvas
 * randomization, Safari Advanced Fingerprinting Protection, and Brave farbling
 * change a few colour bytes on readback. Terrarium stores elevation as
 * `R * 256 + G + B / 256 − 32768`, so one count of red is 256 m and shows up
 * as a single-vertex needle.
 */
export async function decodeTerrariumWebp(
  bytes: ArrayBuffer,
): Promise<{ width: number; height: number; heights: Float32Array }> {
  const image = await decode(bytes);
  return {
    width: image.width,
    height: image.height,
    heights: decodeTerrarium(image.data, image.width, image.height),
  };
}
