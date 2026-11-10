import { isPolygonClipTopologyError } from "./polygonClip";

export function formatCreateModelError(err: unknown): string {
  if (!(err instanceof Error)) return "Could not build the model.";
  const message = err.message.trim();
  if (!message) return "Could not build the model.";
  if (isPolygonClipTopologyError(message)) {
    return "Could not merge some map polygons for this cut. Try a slightly smaller frame, or turn off Roads and rail.";
  }
  if (/polygon intersection failed during morphological close clamp/i.test(message)) {
    return "Could not merge road surfaces for this cut. Try a slightly smaller frame.";
  }
  if (message.length > 160) return "Could not build the model.";
  return message;
}
