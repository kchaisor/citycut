import { useLayoutEffect } from "react";
import { ShortcutCheatsheet } from "../ShortcutCheatsheet";
import { WindRosePanel } from "../WindRosePanel";
import { shouldShowIntroBridgePill } from "./shouldShowIntroBridgePill";
import { ModelPageSidebar } from "./ModelPageSidebar";
import { ModelPageViewportFooter } from "./ModelPageViewportFooter";
import { ModelPageViewportTabs } from "./ModelPageViewportTabs";
import type { ModelPageViewModel } from "./useModelPage";

export function ModelPageView({ vm }: { vm: ModelPageViewModel }) {
  const {
    analysisKind,
    cutDimLabel,
    introHoldReleasedRef,
    introWebglReadyRef,
    leftOpen,
    modelRootRef,
    setShortcutCheatsheetOpen,
    shortcutCheatsheetOpen,
    sidebarCollapsed,
    siteWind,
    tab,
    windSettings,
    windPlan,
    topbarLayout,
  } = vm;

  useWindPlanCardTop(windPlan.active);
  const windCardOn = leftOpen === "analysis" && tab !== "satellite" && analysisKind === "wind" && siteWind != null;

  return (
    <div
      ref={modelRootRef}
      className="model"
      data-view-tab={tab}
      data-topbar-layout={topbarLayout}
      data-cut-size-label={cutDimLabel}
      data-wind-plan={windPlan.active ? windPlan.mode : undefined}
      data-intro-hold={!introHoldReleasedRef.current && tab === "3d" && shouldShowIntroBridgePill() ? "true" : undefined}
      data-intro-webgl-wait={!introWebglReadyRef.current && tab === "3d" && shouldShowIntroBridgePill() ? "true" : undefined}
    >
      <h1 className="sr-only">Your model is ready.</h1>
      <div
        className={`${
          tab === "drawing" ? "viewport is-drawing" : tab === "satellite" ? "viewport is-satellite" : "viewport"
        }${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      >
        <ModelPageViewportTabs vm={vm} />
        <ModelPageSidebar vm={vm} />
        {windCardOn && siteWind ? (
          <div
            className={windPlan.active ? "wind-rose-analysis-card is-plan hud-card" : "wind-rose-analysis-card hud-card"}
            aria-label="Wind rose panel"
          >
            <WindRosePanel
              selection={siteWind}
              period={windSettings.period}
              showGroundWindLegend={windSettings.enabled && tab === "3d"}
              plan={windPlan.active ? windPlan : null}
            />
          </div>
        ) : null}
        <ModelPageViewportFooter vm={vm} />
      </div>
      <ShortcutCheatsheet open={shortcutCheatsheetOpen} onClose={() => setShortcutCheatsheetOpen(false)} />
    </div>
  );
}
const WIND_PLAN_CARD_GAP_PX = 8;

function useWindPlanCardTop(active: boolean) {
  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") return;
    const root = document.documentElement;
    const rail = document.querySelector<HTMLElement>(".model .left-tool-rail");
    if (!rail) return;
    const sync = () => root.style.setProperty("--wind-plan-card-top", `${Math.round(rail.getBoundingClientRect().bottom + WIND_PLAN_CARD_GAP_PX)}px`);
    sync();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(rail);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--wind-plan-card-top");
    };
  }, [active]);
}
