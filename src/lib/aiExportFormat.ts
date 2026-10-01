/**
 * Native Illustrator 8 EPS is the default export. Set VITE_CITYCUT_AI_PDF=true to
 * emit the older PDF-OCG writer (aiDocument.buildLayeredPdf) until native AI8 is
 * verified in desktop Illustrator.
 */
export function usePdfIllustratorExport(): boolean {
  return import.meta.env.VITE_CITYCUT_AI_PDF === "true";
}
