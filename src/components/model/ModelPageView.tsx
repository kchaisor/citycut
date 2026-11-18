import { useLayoutEffect } from "react";
import { ShortcutCheatsheet } from "../ShortcutCheatsheet";
import { WindRosePanel } from "../WindRosePanel";
import { WindPlanComfortLegend, WindPlanInfo, WindPlanVelocityLegend } from "../WindPlanCard";
import {
  placeWindPlanLegend,
  WIND_PLAN_HUD_EVENT,
  WIND_PLAN_HUD_GAP_PX,
  WIND_PLAN_LEGEND_BAR_MAX_PX,
  WIND_PLAN_LEGEND_BAR_MIN_PX,
} from "../../lib/windPlanLegendLayout";
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
  } = vm;

  useWindPlanCardTop(windPlan.active);
  const windCardOn = leftOpen === "analysis" && tab !== "satellite" && analysisKind === "wind" && siteWind != null;
  const speedHudOn = windCardOn && windPlan.active && windPlan.mode === "speed";
  const comfortHudOn = windCardOn && windPlan.active && windPlan.mode === "comfort";
  useWindPlanLegendPlacement(speedHudOn, ".model .wind-plan-velocity");
  useWindPlanLegendPlacement(comfortHudOn, ".model .wind-plan-comfort");

  return (
    <div
      ref={modelRootRef}
      className="model"
      data-view-tab={tab}
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
        {speedHudOn ? (
          <>
            <WindPlanInfo plan={windPlan} period={windSettings.period} />
            <WindPlanVelocityLegend />
          </>
        ) : null}
        {comfortHudOn ? <WindPlanComfortLegend /> : null}
        <ModelPageViewportFooter vm={vm} />
      </div>
      <ShortcutCheatsheet open={shortcutCheatsheetOpen} onClose={() => setShortcutCheatsheetOpen(false)} />
    </div>
  );
}
const WIND_PLAN_CARD_GAP_PX = WIND_PLAN_HUD_GAP_PX;

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

const WIND_PLAN_HUD_INSET_PX = 14;

function rectOf(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}

function useWindPlanLegendPlacement(active: boolean, cardSelector: string) {
  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") return;
    const root = document.documentElement;
    const card = document.querySelector<HTMLElement>(cardSelector);
    const bar = card?.querySelector<HTMLElement>(".wind-plan-velocity-bar") ?? null;
    if (!card) return;
    const watched = [".model .right-inspector", ".model .bottom-bar.env-console", ".model .studio-compass", ".model .left-tool-rail"];
    const sync = () => {
      const rail = rectOf(".model .left-tool-rail");
      const floors = [rectOf(".model .bottom-bar.env-console"), rectOf(".model .studio-compass")].filter((r) => r !== null);
      const next = placeWindPlanLegend({
        viewW: window.innerWidth,
        viewH: window.innerHeight,
        cardW: card.offsetWidth,
        chromeH: card.offsetHeight - (bar?.offsetHeight ?? 0),
        inset: WIND_PLAN_HUD_INSET_PX,
        gap: WIND_PLAN_HUD_GAP_PX,
        topLimit: rail ? rail.top : WIND_PLAN_HUD_INSET_PX,
        barMax: bar ? WIND_PLAN_LEGEND_BAR_MAX_PX : 0,
        barMin: bar ? WIND_PLAN_LEGEND_BAR_MIN_PX : 0,
        inspector: rectOf(".model .right-inspector"),
        floors,
      });
      root.style.setProperty("--wind-plan-legend-right", `${next.right}px`);
      root.style.setProperty("--wind-plan-legend-bottom", `${next.bottom}px`);
      root.style.setProperty("--wind-plan-legend-bar", `${next.barPx}px`);
      window.dispatchEvent(new Event(WIND_PLAN_HUD_EVENT));
    };
    sync();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    for (const selector of watched) {
      const el = document.querySelector(selector);
      if (el) observer?.observe(el);
    }
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--wind-plan-legend-right");
      root.style.removeProperty("--wind-plan-legend-bottom");
      root.style.removeProperty("--wind-plan-legend-bar");
      window.dispatchEvent(new Event(WIND_PLAN_HUD_EVENT));
    };
  }, [active, cardSelector]);
}
