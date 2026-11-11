import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Crop, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NARROW_PANEL_QUERY } from "../lib/panelCollapse";
import { Mark } from "./Mark";

export type SidebarItem = {
  id: string;
  label: string;
  shortLabel?: string;
  icon: ReactNode;
  groupStart?: boolean;
};

const SHORT_RAIL_LABELS: Record<string, string> = {
  "Site Analysis": "Analysis",
  "Model details": "Overview",
};

function useNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(NARROW_PANEL_QUERY).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(NARROW_PANEL_QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function Sidebar({
  id,
  rightId,
  items,
  rightItems,
  active,
  rightActive,
  collapsed,
  title,
  rightTitle,
  status,
  rightStatus,
  footer,
  rightFooter,
  onSelect,
  onToggleCollapse,
  onHome,
  panelSide = "left",
  showNewCut,
  onNewCut,
  brandMeta,
  headerCenter,
  headerRight,
  rightMeta = "MGA55",
  children,
  rightChildren,
}: {
  id: string;
  rightId?: string;
  items: SidebarItem[];
  rightItems?: SidebarItem[];
  active: string;
  rightActive?: string;
  collapsed: boolean;
  panelSide?: "left" | "right";
  title: string;
  rightTitle?: string;
  status?: ReactNode;
  rightStatus?: ReactNode;
  footer?: ReactNode;
  rightFooter?: ReactNode;
  onSelect: (id: string) => void;
  onToggleCollapse: () => void;
  onHome: () => void;
  showNewCut?: boolean;
  onNewCut?: () => void;
  brandMeta?: ReactNode;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
  rightMeta?: ReactNode;
  children: ReactNode;
  rightChildren?: ReactNode;
}) {
  const narrow = useNarrow();
  const titleId = useId();
  const rightTitleId = useId();
  const resolvedRightId = rightId ?? `${id}-right`;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-rail-item]")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    const previous = "ArrowLeft";
    const next = "ArrowRight";
    if (
      event.key !== previous &&
      event.key !== next &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const step = event.key === next || event.key === "ArrowDown" ? 1 : -1;
    const target =
      event.key === "Home"
        ? buttons[0]
        : event.key === "End"
          ? buttons[buttons.length - 1]
          : buttons[(index + step + buttons.length) % buttons.length];
    target?.focus();
  }

  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const newCutIcon = showNewCut && onNewCut && collapsed;

  const renderRailButton = (item: SidebarItem, isRight = false) => {
    const on = isRight ? item.id === (rightActive ?? active) : item.id === active;
    const controlsId = isRight && rightChildren !== undefined ? resolvedRightId : id;
    const displayLabel = item.shortLabel ?? SHORT_RAIL_LABELS[item.label] ?? item.label;

    if (isRight) {
      return (
        <span key={item.id} className="sidebar-rail-slot">
          <button
            type="button"
            className={on ? "rail-btn insp-tab active is-active" : "rail-btn insp-tab"}
            data-rail-item=""
            data-section={item.id}
            aria-label={item.label}
            aria-pressed={on}
            aria-controls={controlsId}
            onClick={() => onSelect(item.id)}
          >
            <span className="rail-tip" aria-hidden="true">
              {displayLabel}
            </span>
          </button>
        </span>
      );
    }

    return (
      <span key={item.id} className="sidebar-rail-slot">
        {item.groupStart && <span className="sidebar-rail-sep rail-sep" aria-hidden="true" />}
        <button
          type="button"
          className={on ? "rail-btn active is-active" : "rail-btn"}
          data-rail-item=""
          data-section={item.id}
          aria-label={item.label}
          aria-pressed={on}
          aria-controls={controlsId}
          onClick={() => onSelect(item.id)}
        >
          {item.icon}
          <span className="rail-tip" aria-hidden="true">
            {displayLabel}
          </span>
        </button>
      </span>
    );
  };

  return (
    <div className={collapsed ? "sidebar is-collapsed" : "sidebar"}>
      <div className="sidebar-brand-bar">
        <div className="studio-header-left top-bar-left hud-card">
          <button className="sidebar-brand" type="button" onClick={onHome} aria-label="CityCut home">
            <span className="sidebar-brand-mark brand-mark-sm">
              <Mark />
            </span>
            <span className="sidebar-brand-name brand-name-sm">CityCut</span>
          </button>
          {brandMeta}
          {showNewCut && onNewCut && !collapsed ? (
            <button
              className="sidebar-new-cut new-cut-pill"
              type="button"
              aria-label="New cut"
              onClick={onNewCut}
            >
              + New cut
            </button>
          ) : null}
        </div>
        {headerCenter ? (
          <div className="studio-header-center top-bar-center hud-card">{headerCenter}</div>
        ) : null}
        {headerRight ? (
          <div className="studio-header-right top-bar-right hud-card">{headerRight}</div>
        ) : null}
      </div>
      <div className="sidebar-main">
        <nav
          className="sidebar-rail icon-rail left-tool-rail hud-card"
          role="toolbar"
          aria-label="Model tools"
          aria-orientation="horizontal"
          data-narrow={narrow ? "true" : undefined}
          onKeyDown={onKeyDown}
        >
          {newCutIcon ? (
            <span className="sidebar-rail-slot">
              <button
                type="button"
                className="rail-btn sidebar-new-cut-icon"
                aria-label="New cut"
                onClick={onNewCut}
              >
                <Crop size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="rail-tip" aria-hidden="true">
                  New cut
                </span>
              </button>
              <span className="sidebar-rail-sep rail-sep" aria-hidden="true" />
            </span>
          ) : null}
          {items.map((item) => renderRailButton(item, false))}
          {narrow && rightItems && rightItems.length > 0
            ? rightItems.map((item) => renderRailButton(item, true))
            : null}
          <span className="sidebar-rail-spacer sr-only" aria-hidden="true" />
          <button
            type="button"
            className="rail-btn sidebar-collapse sr-only"
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            aria-controls={id}
            onClick={onToggleCollapse}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className="rail-tip" aria-hidden="true">
              {collapseLabel}
            </span>
          </button>
        </nav>
        <section
          id={id}
          className={
            panelSide === "right"
              ? "sidebar-panel is-right hud-card"
              : "sidebar-panel left-outliner hud-card"
          }
          data-panel-side={panelSide}
          data-active-section={active}
          aria-labelledby={titleId}
          hidden={collapsed || (panelSide !== "right" && active === "analysis")}
        >
          <header className={active === "drawing" || active === "display" ? "sidebar-head sr-only" : "sidebar-head"}>
            <h2 id={titleId}>{title}</h2>
            {status}
          </header>
          <div className="sidebar-body">{children}</div>
          {footer && <div className="sidebar-foot">{footer}</div>}
        </section>
        {(!narrow && rightItems && rightItems.length > 0) || rightChildren !== undefined ? (
          <div className="right-inspector hud-card">
            <div className="insp-head">
              <span className="card-title">Site Intelligence</span>
              <span className="card-meta mono">{rightMeta}</span>
            </div>
            {!narrow && rightItems && rightItems.length > 0 ? (
              <nav
                className="sidebar-rail icon-rail is-right-rail insp-tabs"
                role="toolbar"
                aria-label="Model info"
                aria-orientation="horizontal"
                onKeyDown={onKeyDown}
              >
                {rightItems.map((item) => renderRailButton(item, true))}
              </nav>
            ) : null}
            {rightChildren !== undefined ? (
              <section
                id={resolvedRightId}
                className="sidebar-panel is-right"
                data-panel-side="right"
                aria-labelledby={rightTitleId}
                hidden={narrow ? collapsed : false}
              >
                <header className="sidebar-head sr-only">
                  <h2 id={rightTitleId}>{rightTitle}</h2>
                  {rightStatus}
                </header>
                <div className="sidebar-body">{rightChildren}</div>
                {rightFooter && <div className="sidebar-foot">{rightFooter}</div>}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
