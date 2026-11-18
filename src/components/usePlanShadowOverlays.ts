import { useMemo } from "react";
import { planShadowSplitRings, shadowRingsFromMulti, type PlanShadowInput } from "../lib/buildingShadows";
import { getColour } from "../lib/colours";
import { planTreeShadowMulti } from "../lib/solarTreePlanShadow";
import { rasterizePlanShadowRings, rasterizeSunStudyLayers } from "../lib/sunStudyShadowRaster";
import type { SunStudyDate } from "../lib/sunStudyPlan";
import type { CityModel } from "../types";
import type { useSunStudyShadows } from "./useSunStudyShadows";

export function usePlanShadowOverlays({
  model,
  casterModel,
  shadowInput,
  castShadows,
  figure,
  study,
  studyLayers,
  isolateCasters,
  splitShadow,
  treesCastShadow,
}: {
  model: CityModel;
  casterModel: CityModel;
  shadowInput: PlanShadowInput | null | undefined;
  castShadows: boolean | undefined;
  figure: boolean;
  study: SunStudyDate | null;
  studyLayers: ReturnType<typeof useSunStudyShadows>["layers"];
  isolateCasters: boolean;
  splitShadow: boolean;
  treesCastShadow: boolean;
}) {
  const treeCrownShadowFill = getColour("--sun-study-tree-shadow");
  const shadowSplit = useMemo(() => {
    if (!castShadows || !shadowInput || figure || study) return { existing: [], added: [] };
    return planShadowSplitRings(casterModel, shadowInput, true, "off");
  }, [castShadows, figure, casterModel, shadowInput, study]);
  const scrubbedTreeCrownShadows = useMemo(() => {
    if (!treesCastShadow || !castShadows || !shadowInput || figure) return [];
    const trees = model.trees ?? [];
    if (trees.length === 0) return [];
    return shadowRingsFromMulti(planTreeShadowMulti(model, shadowInput, trees));
  }, [treesCastShadow, castShadows, shadowInput, figure, model]);
  const studyShadowRasters = useMemo(() => {
    if (!study || isolateCasters || studyLayers.length === 0) return [];
    const layers = splitShadow
      ? studyLayers.map((layer) => ({ ...layer, addedRings: [] as typeof layer.addedRings }))
      : studyLayers;
    return rasterizeSunStudyLayers(layers, model.sideM);
  }, [study, isolateCasters, splitShadow, studyLayers, model.sideM]);
  const studyScrubAddedRings = useMemo(() => {
    if (!study || isolateCasters || !splitShadow || !shadowInput) return [];
    const layer = studyLayers.find((entry) => entry.hour === shadowInput.hour);
    return layer?.addedRings ?? [];
  }, [study, isolateCasters, splitShadow, shadowInput, studyLayers]);
  const treeCrownShadowRaster = useMemo(
    () =>
      scrubbedTreeCrownShadows.length > 0
        ? rasterizePlanShadowRings(scrubbedTreeCrownShadows, model.sideM, treeCrownShadowFill, 0.68)
        : null,
    [scrubbedTreeCrownShadows, model.sideM, treeCrownShadowFill],
  );
  return { shadowSplit, studyShadowRasters, studyScrubAddedRings, treeCrownShadowRaster };
}
