import { ChevronDown, Download, PanelRight, RotateCcw } from "lucide-react";
import { StudioCompass } from "../StudioCompass";
import { studioCompassVisible } from "../../lib/studioCompass";
import { Sidebar } from "../Sidebar";
import { type DrawingKind } from "../DrawingPlan";
import { mgaCrs } from "../../lib/crsZone";
import { explodedAxoBounds } from "../../lib/explodedAxo";
import { explodedAxoViewportExtent, planViewportExtent } from "../../lib/planViewport";
import { isometricDrawingBounds } from "../../lib/isometricDrawing";
import {
  SIDEBAR_PANEL_ID,
  RIGHT_SIDEBAR_PANEL_ID,
  type Tab,
} from "./modelPageConstants";
import { SIDEBAR_SECTION_LABELS } from "../../lib/sidebarSections";
import { ModelPageSidebarLeftA } from "./ModelPageSidebarLeftA";
import { ModelPageSidebarLeftB } from "./ModelPageSidebarLeftB";
import { ModelPageSidebarRight } from "./ModelPageSidebarRight";
import { SolarStudyHudCard } from "./SolarStudyHudCard";
import { ViewshedHudCard } from "./ViewshedHudCard";
import { WindRoseHudCard } from "./WindRoseHudCard";
import { SunHoursLegendDock } from "./SunHoursLegendDock";
import { solarSettingsForActiveAnalysis } from "../../lib/solarStudyView";
import { sunHoursLegendCardOn } from "./sunHoursLegendCard";

export function ModelPageSidebar({ vm }: { vm: import("./useModelPage").ModelPageViewModel }) {
  const {
    axoSettings,
    busy,
    comMeasuredHeightCount,
    commitView,
    displayModel,
    drawing,
    items,
    leftOpen,
    massing,
    model,
    onHome,
    onNewCut,
    overrideResult,
    rightItems,
    rightOpen,
    save3dm,
    saveExplodedAxoAi,
    saveFigureAi,
    saveFigureSvg,
    saveIsometricAi,
    saveIsometricSvg,
    savePng,
    saveSite3dm,
    saveSiteAi,
    saveSiteSvg,
    selectSection,
    setDrawing,
    setExplodedViewport,
    setFitCounter,
    setIsoDrawingViewport,
    setPlanViewport,
    setSidebarCollapsed,
    setSnapId,
    setTab,
    setTopbarExportOpen,
    sidebarCollapsed,
    siteIntelOpen,
    setSiteIntelOpen,
    sourcesLoaded,
    compassHeadingDeg,
    tab,
    topbarExportOpen,
    topbarExportRef,
    topbarExportTriggerRef,
    view,
  } = vm;
  const { analysisCards, analysisCardOn, siteIntelFolded, setSiteIntelFolded } = vm;
  const sunHoursLegendOn = sunHoursLegendCardOn({
    tab,
    drawing,
    sunHours: Boolean(solarSettingsForActiveAnalysis(vm.solar, vm.analyses).sunHours),
    hasResult: vm.sunHoursGround.grid != null,
    pending: vm.sunHoursGround.pending || vm.sunHoursGround.pendingSurfaces,
  });
  const sunHoursLegendAlone = sunHoursLegendOn && !analysisCards.solar;

  return (
        <div className="sidebar-host">
          <Sidebar
            id={SIDEBAR_PANEL_ID}
            rightId={RIGHT_SIDEBAR_PANEL_ID}
            items={items}
            rightItems={rightItems}
            active={leftOpen}
            rightActive={rightOpen}
            collapsed={sidebarCollapsed}
            title={SIDEBAR_SECTION_LABELS[leftOpen]}
            rightTitle={SIDEBAR_SECTION_LABELS[rightOpen]}
            onHome={onHome}
            onNewCut={onNewCut}
            showNewCut
            onSelect={selectSection}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            siteIntel={{
              open: siteIntelOpen,
              onToggle: () => setSiteIntelOpen(!siteIntelOpen),
              icon: <PanelRight size={16} strokeWidth={1.75} aria-hidden="true" />,
              fold: analysisCardOn
                ? {
                    folded: siteIntelFolded,
                    onToggle: () => setSiteIntelFolded(!siteIntelFolded),
                    chevron: <ChevronDown className="insp-head-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />,
                  }
                : undefined,
            }}
            rightMeta={`MGA${mgaCrs(model.center.lon).zone}`}
            rightBelow={
              analysisCardOn || sunHoursLegendAlone ? (
                <>
                  {analysisCards.solar ? <SolarStudyHudCard vm={vm} /> : null}
                  {analysisCards.wind ? <WindRoseHudCard vm={vm} /> : null}
                  {analysisCards.view ? <ViewshedHudCard vm={vm} /> : null}
                  {sunHoursLegendAlone ? <SunHoursLegendDock sunHoursGround={vm.sunHoursGround} /> : null}
                </>
              ) : undefined
            }
            brandMeta={
              <>
                <span className="v-sep hud-sep" aria-hidden="true" />
                <span className="place-chip studio-breadcrumb-place" title={model.placeLabel}>
                  {model.placeLabel}
                </span>
              </>
            }
            headerCenter={
              <div className="header-center-cluster">
                {tab === "3d" && studioCompassVisible(view.projection, view.freeRotate) && (
                  <StudioCompass headingDeg={compassHeadingDeg} />
                )}
                <select
                  className="topbar-view-select"
                  aria-label="Model view"
                  value={tab}
                  onChange={(event) => setTab(event.target.value as Tab)}
                >
                  <option value="3d">3D</option>
                  <option value="drawing">Drawing</option>
                  <option value="satellite">Satellite</option>
                </select>
                <div className="tabs mode-group studio-view-tabs" role="tablist" aria-label="Model views">
                  {(
                    [
                      ["3d", "3D model"],
                      ["drawing", "Drawing"],
                      ["satellite", "Satellite"],
                    ] as const
                  ).map(([id, label], index) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      data-autofocus={index === 0 ? "true" : undefined}
                      aria-selected={tab === id}
                      className={tab === id ? "mode-btn active" : "mode-btn"}
                      onClick={() => setTab(id)}
                    >
                      {id === "3d" && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                      )}
                      {id === "drawing" && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                      )}
                      {id === "satellite" && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      )}
                      {label}
                    </button>
                  ))}
                </div>
                <span className="v-sep" aria-hidden="true" />
                {tab === "3d" ? (
                  <>
                    <select
                      className="topbar-3d-select"
                      aria-label="3D projection"
                      value={view.projection}
                      onChange={(event) => {
                        const projection = event.target.value as "perspective" | "iso" | "plan";
                        if (projection === "plan") {
                          commitView({ projection: "plan", corner: view.corner, freeRotate: false }, true);
                        } else {
                          commitView({ ...view, projection }, false);
                        }
                      }}
                    >
                      <option value="perspective">Perspective</option>
                      <option value="iso">Iso</option>
                      <option value="plan">Plan</option>
                    </select>
                    <div className="proj-group studio-submode-pills topbar-3d-modes" role="group" aria-label="3D projection">
                      <button
                        type="button"
                        className={view.projection === "perspective" ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                        aria-pressed={view.projection === "perspective"}
                        onClick={() => commitView({ ...view, projection: "perspective" }, false)}
                      >
                        Perspective
                      </button>
                      <button
                        type="button"
                        className={view.projection === "iso" ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                        aria-pressed={view.projection === "iso"}
                        onClick={() => commitView({ ...view, projection: "iso" }, false)}
                      >
                        Isometric
                      </button>
                      <button
                        type="button"
                        className={view.projection === "plan" ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                        aria-pressed={view.projection === "plan"}
                        onClick={() => commitView({ projection: "plan", corner: view.corner, freeRotate: false }, true)}
                      >
                        Plan
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <select
                      className="topbar-drawing-select"
                      aria-label="Drawing mode"
                      value={drawing}
                      onChange={(event) => {
                        setDrawing(event.target.value as DrawingKind);
                        setTab("drawing");
                      }}
                    >
                      <option value="site">Site plan</option>
                      <option value="figure-ground">Fig-grnd</option>
                      <option value="exploded-axo">Expl axo</option>
                      <option value="isometric">Iso</option>
                    </select>
                    <div className="proj-group studio-submode-pills topbar-drawing-modes" aria-label="Quick drawing modes">
                      {(
                        [
                          ["site", "Site plan"],
                          ["figure-ground", "Figure-ground"],
                          ["exploded-axo", "Exploded axo"],
                          ["isometric", "Isometric"],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className={tab === "drawing" && drawing === kind ? "proj-btn active studio-submode-pill is-active" : "proj-btn studio-submode-pill"}
                          aria-label={`Quick ${label}`}
                          aria-pressed={tab === "drawing" && drawing === kind}
                          onClick={() => {
                            setDrawing(kind);
                            setTab("drawing");
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <span className="v-sep" aria-hidden="true" />
                <button
                  type="button"
                  className="cam-reset studio-reset-btn topbar-compact-icon-btn"
                  aria-label="Reset view"
                  title="Reset view"
                  onClick={() => {
                    if (tab === "3d") {
                      setSnapId((id) => id + 1);
                    } else if (tab === "drawing" && drawing === "exploded-axo") {
                      setExplodedViewport(
                        explodedAxoViewportExtent(explodedAxoBounds(displayModel, axoSettings)),
                      );
                      setFitCounter((token) => token + 1);
                    } else if (tab === "drawing" && drawing === "isometric") {
                      setIsoDrawingViewport(
                        explodedAxoViewportExtent(isometricDrawingBounds(displayModel, view.corner)),
                      );
                      setFitCounter((token) => token + 1);
                    } else {
                      setPlanViewport(planViewportExtent(displayModel.sideM));
                      setFitCounter((token) => token + 1);
                    }
                  }}
                >
                  <RotateCcw size={15} strokeWidth={2.1} className="topbar-compact-icon" aria-hidden="true" />
                </button>
              </div>
            }
            headerRight={
              <>
                <span className="ready-dot status-dot is-ready" aria-hidden="true" />
                <span className="ready-text studio-status-pill mono">
                  Ready · {sourcesLoaded.loaded}/{sourcesLoaded.total} sources
                </span>
                <span className="v-sep" aria-hidden="true" />
                <div className="topbar-export-wide studio-quick-exports">
                  {tab === "drawing" ? (
                    <>
                      <button
                        type="button"
                        className="btn-export-3dm studio-export-btn is-primary"
                        aria-label="Quick export Adobe Illustrator .ai"
                        disabled={busy !== null}
                        onClick={() => {
                          if (drawing === "site") void saveSiteAi();
                          else if (drawing === "figure-ground") void saveFigureAi();
                          else if (drawing === "isometric") void saveIsometricAi();
                          else void saveExplodedAxoAi();
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        .ai
                      </button>
                      <button
                        type="button"
                        className="btn-export-png studio-export-btn"
                        aria-label="Quick export SVG"
                        disabled={busy !== null || drawing === "exploded-axo"}
                        onClick={() => {
                          if (drawing === "figure-ground") void saveFigureSvg();
                          else if (drawing === "isometric") void saveIsometricSvg();
                          else void saveSiteSvg();
                        }}
                      >
                        .svg
                      </button>
                      <button
                        type="button"
                        className="btn-export-3dm studio-export-btn"
                        aria-label="Quick export 3dm"
                        disabled={busy !== null || drawing !== "site"}
                        onClick={() => void saveSite3dm()}
                      >
                        .3dm
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-export-3dm studio-export-btn is-primary"
                        aria-label="Quick export Rhino .3dm"
                        disabled={busy !== null}
                        onClick={() => void save3dm()}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Rhino .3dm
                      </button>
                      <button
                        type="button"
                        className="btn-export-png studio-export-btn"
                        aria-label="Quick export 2x PNG"
                        disabled={busy !== null}
                        onClick={() => void savePng()}
                      >
                        2× PNG
                      </button>
                    </>
                  )}
                </div>
                <div className="topbar-export-compact" ref={topbarExportRef}>
                  <button
                    ref={topbarExportTriggerRef}
                    type="button"
                    className="topbar-export-trigger studio-export-btn"
                    aria-label="Export"
                    aria-haspopup="menu"
                    aria-expanded={topbarExportOpen}
                    onClick={() => setTopbarExportOpen((open) => !open)}
                  >
                    <Download size={15} strokeWidth={2.1} aria-hidden="true" />
                    <span className="topbar-export-trigger-label">Export</span>
                  </button>
                  <div
                    className="topbar-export-menu hud-card"
                    role="menu"
                    hidden={!topbarExportOpen}
                  >
                    {tab === "drawing" ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="topbar-export-menu-item"
                          aria-label="Quick export Adobe Illustrator .ai"
                          disabled={busy !== null}
                          onClick={() => {
                            setTopbarExportOpen(false);
                            if (drawing === "site") void saveSiteAi();
                            else if (drawing === "figure-ground") void saveFigureAi();
                            else if (drawing === "isometric") void saveIsometricAi();
                            else void saveExplodedAxoAi();
                          }}
                        >
                          Adobe Illustrator (.ai)
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="topbar-export-menu-item"
                          aria-label="Quick export SVG"
                          disabled={busy !== null || drawing === "exploded-axo"}
                          onClick={() => {
                            setTopbarExportOpen(false);
                            if (drawing === "figure-ground") void saveFigureSvg();
                            else if (drawing === "isometric") void saveIsometricSvg();
                            else void saveSiteSvg();
                          }}
                        >
                          SVG (.svg)
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="topbar-export-menu-item"
                          aria-label="Quick export 3dm"
                          disabled={busy !== null || drawing !== "site"}
                          onClick={() => {
                            setTopbarExportOpen(false);
                            void saveSite3dm();
                          }}
                        >
                          Rhino (.3dm)
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="topbar-export-menu-item"
                          aria-label="Quick export Rhino .3dm"
                          disabled={busy !== null}
                          onClick={() => {
                            setTopbarExportOpen(false);
                            void save3dm();
                          }}
                        >
                          Rhino (.3dm)
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="topbar-export-menu-item"
                          aria-label="Quick export 2x PNG"
                          disabled={busy !== null}
                          onClick={() => {
                            setTopbarExportOpen(false);
                            void savePng();
                          }}
                        >
                          2× PNG
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            }
            status={
              leftOpen === "import" ? (
                <span className="sidebar-status">
                  {massing.imported.length} model{massing.imported.length === 1 ? "" : "s"}
                </span>
              ) : null
            }
            rightStatus={
              rightOpen === "summary" ? (
                <span className="sidebar-status">
                  <i className="status-dot is-ready" aria-hidden="true" />
                  Ready
                </span>
              ) : rightOpen === "buildings" ? (
                <span className="sidebar-status">
                  {comMeasuredHeightCount.toLocaleString()} of {displayModel.buildings.length.toLocaleString()} measured
                </span>
              ) : null
            }
            rightFooter={
              rightOpen === "buildings" ? (
                <p className="sidebar-foot-note">
                  {overrideResult.manualCount.toLocaleString()} manual height
                  {overrideResult.manualCount === 1 ? "" : "s"}
                </p>
              ) : null
            }
            rightChildren={
              <>
                <ModelPageSidebarRight vm={vm} />
              </>
            }
          >
            <ModelPageSidebarLeftA vm={vm} />
            <ModelPageSidebarLeftB vm={vm} />
          </Sidebar>
        </div>
  );
}
