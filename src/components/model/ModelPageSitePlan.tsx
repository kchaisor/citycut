import { DrawingPlan } from "../DrawingPlan";
import { SolarAssessResultsList } from "../SolarAssessResultsList";
import { SunHoursGroundLegendList } from "../SunHoursGroundLegendList";
import { SunHoursLostLegendList } from "../SunHoursLostLegendList";
import { sunStudyMutedOn, toggleSelection } from "../../lib/sunStudyPlan";
import { defaultParkRuleId, type ParkSolarRuleId } from "../../lib/solarRuleRegistry";
import { nextParkReceptorId, nextReceptorId, normalizeReceptorRing } from "../../lib/solarReceptorStore";
import type { ModelPageViewModel } from "./useModelPage";

export function ModelPageSitePlan({ vm }: { vm: ModelPageViewModel }) {
  const {
    colourByUse,
    drawing,
    drawingModel,
    effectiveSunStudyCasters,
    figureScale,
    fitCounter,
    heliodonDiagramExport,
    lineStyles,
    model,
    onScale,
    overrideResult,
    planShadowInput,
    planViewport,
    sectionKnifeTool,
    setPlanViewport,
    setSolar,
    setSolarReceptors,
    setSunStudySelected,
    showManualEdits,
    showSource,
    solar,
    solarAssessEnabled,
    solarReceptorAssess,
    sunHoursGround,
    sunHoursLostPlan,
    sunStudyDate,
    sunStudySelected,
    visibleSolarReceptors,
  } = vm;

  return (
    <div className="plan-viewport-stack">
      <DrawingPlan
        model={drawingModel}
        sectionKnife={sectionKnifeTool}
        kind={drawing}
        onScale={onScale}
        lineStyle={lineStyles}
        planScale={figureScale}
        heliodon={
          sunStudyDate
            ? (heliodonDiagramExport() ?? { ...planShadowInput(), sideM: model.sideM, radiusFactor: solar.radiusFactor })
            : heliodonDiagramExport()
        }
        castShadows={solar.castShadows}
        shadowInput={planShadowInput()}
        sunStudy={sunStudyDate}
        sunStudyMuted={sunStudyMutedOn(solar.sunStudy, solar.sunStudyMuted)}
        sunStudyCasters={effectiveSunStudyCasters}
        sunStudySelected={sunStudySelected}
        onSunStudyPick={(id) =>
          setSunStudySelected((current) => {
            const next = toggleSelection(current, id);
            setSolar((prev) => ({
              ...prev,
              sunStudyCasters: next.length > 0 ? "selected" : "all",
            }));
            return next;
          })
        }
        solarReceptors={visibleSolarReceptors}
        solarReceptorResults={solarAssessEnabled ? solarReceptorAssess.results : []}
        sunHoursLostGrid={solar.sunHoursLost ? sunHoursLostPlan.grid : null}
        sunHoursGroundGrid={solar.sunHours ? sunHoursGround.grid : null}
        sunHoursGroundScaleMax={solar.sunHours ? sunHoursGround.scaleMaxHours : 0}
        sunHoursRoofPlanRaster={solar.sunHours ? sunHoursGround.overlay?.roofPlanRaster ?? null : null}
        treesCastShadow={Boolean(solar.treesCastShadow)}
        receptorDraw={Boolean(
          (solar.solarAccess && solar.receptorDraw) || (solar.solarParkAccess && solar.parkReceptorDraw),
        )}
        onReceptorCommit={(ring) => {
          const normalized = normalizeReceptorRing(ring);
          if (!normalized) return;
          if (solar.parkReceptorDraw && solar.solarParkAccess) {
            const ruleId = (solar.parkRuleId ?? defaultParkRuleId()) as ParkSolarRuleId;
            setSolarReceptors((current) => [
              ...current,
              { id: nextParkReceptorId(current), ring: normalized, kind: "park", ruleId },
            ]);
            return;
          }
          setSolarReceptors((current) => [
            ...current,
            { id: nextReceptorId(current), ring: normalized, kind: "yard" },
          ]);
        }}
        uniformBuildings={!colourByUse && !showSource}
        colourBySource={showSource}
        highlightManual={showManualEdits && overrideResult.manualCount > 0}
        viewport={planViewport}
        onViewportChange={setPlanViewport}
        fitCounter={fitCounter}
      />
      {(solar.sunHours && sunHoursGround.grid) ||
      (solar.sunHoursLost && sunHoursLostPlan.grid) ||
      (solarAssessEnabled && solarReceptorAssess.results.length > 0) ? (
        <div className="plan-solar-dock-stack" data-plan-solar-dock-stack>
          {solar.sunHours && sunHoursGround.grid ? (
            <div className="plan-solar-legend-dock hud-card" data-sun-hours-ground-legend-dock>
              <SunHoursGroundLegendList
                compact
                maxHours={sunHoursGround.scaleMaxHours || sunHoursGround.grid.maxSunHours}
                pending={sunHoursGround.pending || sunHoursGround.pendingSurfaces}
              />
            </div>
          ) : null}
          {solar.sunHoursLost && sunHoursLostPlan.grid ? (
            <div className="plan-solar-legend-dock hud-card" data-sun-hours-lost-legend-dock>
              <SunHoursLostLegendList compact includesTrees={Boolean(solar.treesCastShadow)} />
            </div>
          ) : null}
          {solarAssessEnabled && solarReceptorAssess.results.length > 0 ? (
            <div className="plan-solar-results-dock hud-card" data-solar-results-dock>
              <SolarAssessResultsList rows={solarReceptorAssess.results} compact />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
