import { vicmapWfsGetFeatureUrl } from "./vicmapWfs";
import type { FrameBBox } from "./useCascade";

export function classifyPlanningSchemeForTest(scheme: string): string | null {
  const code = scheme.trim().toUpperCase();
  if (code === "LSIO" || code === "SBO" || code === "FO") return "flood";
  if (code === "HO") return "heritage";
  if (code === "DDO") return "ddo";
  if (code === "BMO") return "bmo";
  return null;
}

export function planningWfsUrlForTest(bounds: FrameBBox): string {
  return vicmapWfsGetFeatureUrl("open-data-platform:plan_overlay", bounds, {
    count: 2000,
    propertyName: "scheme_code,geom",
  });
}
