/**
 * The PDF-OCG writer (aiDocument.buildLayeredPdf) is the default .ai export.
 * Set VITE_CITYCUT_AI_NATIVE=true to emit the Illustrator 8 EPS writer
 * (aiNative.buildLayeredNativeAi) until it is confirmed to open in Illustrator.
 */
export function useNativeAi8Export(): boolean {
  return import.meta.env.VITE_CITYCUT_AI_NATIVE === "true";
}
