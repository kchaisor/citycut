import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Crop, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NARROW_PANEL_QUERY } from "../lib/panelCollapse";
import { Mark } from "./Mark";

export type SidebarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Draw a hairline above this item, to group the rail. */
  groupStart?: boolean;
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

/**
 * Fixed left sidebar with the icon rail built in. The rail picks one section; it never
 * toggles the panel shut. Only the collapse button at the foot of the rail hides the
 * panel. Every section stays mounted (the caller hides the inactive ones), so state in
 * a section survives a switch.
 *
 * Brand (logo + wordmark) sits in a 56 px bar above the rail and panel so the map can
 * use the full window height with no app top bar. On the model page, New cut lives in
 * that bar; when the sidebar is collapsed it becomes a rail icon with a tooltip.
 */
export function Sidebar({
  id,
  items,
  active,
  collapsed,
  title,
  status,
  footer,
  onSelect,
  onToggleCollapse,
  onHome,
  panelSide = "left",
  showNewCut,
  onNewCut,
  children,
}: {
  id: string;
  items: SidebarItem[];
  active: string;
  collapsed: boolean;
  panelSide?: "left" | "right";
  title: string;
  status?: ReactNode;
  footer?: ReactNode;
  onSelect: (id: string) => void;
  onToggleCollapse: () => void;
  onHome: () => void;
  showNewCut?: boolean;
  onNewCut?: () => void;
  children: ReactNode;
}) {
  const narrow = useNarrow();
  const titleId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-rail-item]")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    const previous = narrow ? "ArrowLeft" : "ArrowUp";
    const next = narrow ? "ArrowRight" : "ArrowDown";
    if (event.key !== previous && event.key !== next && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? buttons[0]
        : event.key === "End"
          ? buttons[buttons.length - 1]
          : buttons[(index + (event.key === next ? 1 : -1) + buttons.length) % buttons.length];
    target?.focus();
  }

  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const newCutIcon = showNewCut && onNewCut && collapsed;

  return (
    <div className={collapsed ? "sidebar is-collapsed" : "sidebar"}>
      <div className="sidebar-brand-bar">
        <button className="sidebar-brand" type="button" onClick={onHome} aria-label="CityCut home">
          <span className="sidebar-brand-mark">
            <Mark />
          </span>
          <span className="sidebar-brand-name">CityCut</span>
        </button>
        {showNewCut && onNewCut && !collapsed ? (
          <button className="sidebar-new-cut" type="button" onClick={onNewCut}>
            New cut
          </button>
        ) : null}
      </div>
      <div className="sidebar-main">
        <nav
          className="sidebar-rail icon-rail"
          role="toolbar"
          aria-label="Model tools"
          aria-orientation={narrow ? "horizontal" : "vertical"}
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
              <span className="sidebar-rail-sep" aria-hidden="true" />
            </span>
          ) : null}
          {items.map((item) => {
            const on = item.id === active;
            return (
              <span key={item.id} className="sidebar-rail-slot">
                {item.groupStart && <span className="sidebar-rail-sep" aria-hidden="true" />}
                <button
                  type="button"
                  className={on ? "rail-btn is-active" : "rail-btn"}
                  data-rail-item=""
                  data-section={item.id}
                  aria-label={item.label}
                  aria-pressed={on}
                  aria-controls={id}
                  onClick={() => onSelect(item.id)}
                >
                  {item.icon}
                  <span className="rail-tip" aria-hidden="true">
                    {item.label}
                  </span>
                </button>
              </span>
            );
          })}
          <span className="sidebar-rail-spacer" aria-hidden="true" />
          <button
            type="button"
            className="rail-btn sidebar-collapse"
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
          className={panelSide === "right" ? "sidebar-panel is-right" : "sidebar-panel"}
          data-panel-side={panelSide}
          aria-labelledby={titleId}
          hidden={collapsed}
        >
          <header className="sidebar-head">
            <h2 id={titleId}>{title}</h2>
            {status}
          </header>
          <div className="sidebar-body">{children}</div>
          {footer && <div className="sidebar-foot">{footer}</div>}
        </section>
      </div>
    </div>
  );
}
