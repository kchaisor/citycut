import type { HeliodonDiagramExportOptions } from "./heliodonDiagram";

export function planHeliodonForExport(input: {
  showPath: boolean;
  diagram: HeliodonDiagramExportOptions;
}): HeliodonDiagramExportOptions | null {
  return input.showPath ? input.diagram : null;
}
