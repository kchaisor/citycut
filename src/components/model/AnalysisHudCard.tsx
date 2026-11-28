import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { SiteAnalysisKind } from "../../lib/sidebarSections";

export function AnalysisHudCard({
  kind,
  title,
  meta,
  label,
  collapsed,
  onToggle,
  className,
  children,
}: {
  kind: SiteAnalysisKind | "exploded-axo";
  title: string;
  meta: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  const classes = [className, "analysis-hud-card", "hud-card", collapsed ? "is-collapsed" : null].filter(Boolean);
  return (
    <div className={classes.join(" ")} aria-label={label} data-analysis-card={kind}>
      <button
        type="button"
        className="analysis-card-head"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="card-title">{title}</span>
        <span className="analysis-card-head-end">
          <span className="card-meta mono">{meta}</span>
          <ChevronDown className="analysis-card-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
      <div id={bodyId} className="analysis-card-fold" hidden={collapsed}>
        {collapsed ? null : <div className="analysis-card-body">{children}</div>}
      </div>
    </div>
  );
}
