import { ShortcutCheatsheet } from "../ShortcutCheatsheet";
import { shouldShowIntroBridgePill } from "./shouldShowIntroBridgePill";
import { ModelPageSidebar } from "./ModelPageSidebar";
import { ModelPageViewportFooter } from "./ModelPageViewportFooter";
import { ModelPageViewportTabs } from "./ModelPageViewportTabs";
import { useRightHudLayout } from "./useRightHudLayout";
import type { ModelPageViewModel } from "./useModelPage";

export function ModelPageView({ vm }: { vm: ModelPageViewModel }) {
  const {
    analyses,
    cutDimLabel,
    introHoldReleasedRef,
    introWebglReadyRef,
    modelRootRef,
    setShortcutCheatsheetOpen,
    shortcutCheatsheetOpen,
    sidebarCollapsed,
    siteIntelOpen,
    siteIntelFolded,
    analysisCardOpen,
    leftOpen,
    siteWind,
    tab,
    windSettings,
    windPlan,
    topbarLayout,
  } = vm;

  useRightHudLayout(modelRootRef, [
    tab,
    analyses,
    siteWind,
    siteIntelOpen,
    leftOpen,
    sidebarCollapsed,
    windPlan.active,
    windSettings.enabled,
    siteIntelFolded,
    analysisCardOpen,
  ]);

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
        <ModelPageViewportFooter vm={vm} />
      </div>
      <ShortcutCheatsheet open={shortcutCheatsheetOpen} onClose={() => setShortcutCheatsheetOpen(false)} />
    </div>
  );
}
