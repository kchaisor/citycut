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
    topbarLayout,
  } = vm;

  return (
    <div
      ref={modelRootRef}
      className="model"
      data-view-tab={tab}
      data-topbar-layout={topbarLayout}
      data-cut-size-label={cutDimLabel}
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
        {leftOpen === "analysis" && tab !== "satellite" && analysisKind === "wind" && siteWind ? (
          <div className="wind-rose-analysis-card hud-card" aria-label="Wind rose panel">
            <WindRosePanel
              selection={siteWind}
              period={windSettings.period}
              showGroundWindLegend={windSettings.enabled && tab === "3d"}
            />
          </div>
        ) : null}
        <ModelPageViewportFooter vm={vm} />
      </div>
      <ShortcutCheatsheet open={shortcutCheatsheetOpen} onClose={() => setShortcutCheatsheetOpen(false)} />
    </div>
  );
}