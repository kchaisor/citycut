import type { HeliodonDiagramExportOptions } from "./heliodonDiagram";
import type { SunStudyDate } from "./sunStudyPlan";

export function planHeliodonForExport(input: {
  showPath: boolean;
  sunStudyActive: boolean;
  sunStudyDate: SunStudyDate | null;
  diagram: HeliodonDiagramExportOptions;
}): HeliodonDiagramExportOptions | null {
  if (input.showPath) return input.diagram;
  if (input.sunStudyActive && input.sunStudyDate) return input.diagram;
  return null;
}
