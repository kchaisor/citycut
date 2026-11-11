import decode from "@jsquash/webp/decode";
import { decodeTerrarium } from "./terrain";

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
