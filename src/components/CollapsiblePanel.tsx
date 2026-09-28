import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { readPanelCollapsed, viewportIsNarrow, writePanelCollapsed } from "../lib/panelCollapse";

export function CollapsiblePanel({
  storageKey,
  title,
  controlsLabel,
  className,
  ariaLabel,
  toolbar,
  children,
}: {
  storageKey: string;
  title: string;
  controlsLabel: string;
  className?: string;
  ariaLabel?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(() => readPanelCollapsed(storageKey, viewportIsNarrow()));

  function toggle() {
    const next = !collapsed;
    writePanelCollapsed(storageKey, next);
    setCollapsed(next);
  }

  function onChipClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as Element).closest(".panel-toolbar, .chevron-btn")) return;
    toggle();
  }

  const action = collapsed ? `Expand ${controlsLabel}` : `Collapse ${controlsLabel}`;

  return (
    <aside className={["collapsible", className, collapsed ? "is-collapsed" : ""].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      <div className="panel-chip" onClick={onChipClick}>
        <span className="panel-title">{title}</span>
        {toolbar ? (
          <div className="panel-toolbar" onClick={(event) => event.stopPropagation()}>
            {toolbar}
          </div>
        ) : null}
        <button
          type="button"
          className="chevron-btn"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={action}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <ChevronIcon />
        </button>
      </div>
      <div id={bodyId} className="panel-body" hidden={collapsed}>
        <div className="panel-body-inner">{children}</div>
      </div>
    </aside>
  );
}

function ChevronIcon() {
  return (
    <svg className="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.2 4.3 6 8.1l3.8-3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
